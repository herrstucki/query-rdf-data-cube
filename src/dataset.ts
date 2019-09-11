import { namedNode, variable } from "@rdfjs/data-model";
import { NamedNode, Term } from "rdf-js";
import { Generator as SparqlGenerator } from "sparqljs";
import {Component, Attribute, Dimension, Measure} from "./components";
import { ICubeOptions } from "./datacube";
import DataSetQuery from "./query/datasetquery";
import { generateLangCoalesce, generateLangOptionals, IQueryOptions, prefixes } from "./query/utils";
import SparqlFetcher from "./sparqlfetcher";
import { SelectQuery } from "./sparqljs";

type ComponentsCache = {
  attributes: Map<string, Attribute>,
  dimensions: Map<string, Dimension>,
  measures: Map<string, Measure>,
};
type GroupedComponents = { kind: Term, iri: Term, labels: Label[] };
type SerializedDataSet = {
  endpoint: string,
  iri: string,
  graphIri: string,
  labels: Label[],
  languages: string[],
  components: {
    dimensions: string[],
    measures: string[],
    attributes: string[],
  },
};
export type Label = {
  value: string;
  language?: string;
};

export interface IDataSetOptions extends ICubeOptions {
  iri: NamedNode;
  labels?: Label[];
  graphIri: NamedNode;
}

class DataSet {
  /**
   * Deserializes a DataSet from JSON generated by DataSet#toJSON
   */
  public static fromJSON(json: string): DataSet {
    const obj: SerializedDataSet = JSON.parse(json);
    const dataset = new DataSet(obj.endpoint, {
      iri: namedNode(obj.iri),
      graphIri: namedNode(obj.graphIri),
      labels: obj.labels,
      languages: obj.languages,
    });
    ["dimensions", "measures", "attributes"].forEach((componentTypes) => {
      dataset.cachedComponents[componentTypes] = obj.components[componentTypes]
        .map(Component.fromJSON)
        .reduce((cache: Map<string, Component>, component: Component) => {
          cache.set(component.iri.value, component);
          return cache;
        }, new Map());
    });
    return dataset;
  }

  public labels: Label[];
  public iri: string;
  public endpoint: string;
  public graphIri?: string;
  private languages: string[];
  private fetcher: SparqlFetcher;
  private componentsLoaded: boolean = false;
  private cachedComponents: ComponentsCache;

   /**
    * @param endpoint SPARQL endpoint where the DataSet lives.
    * @param options Additional info about the DataSet.
    * @param options.iri The IRI of the DataSet.
    * @param options.graphIri The IRI of the graph from which the data will be fetched.
    * @param options.labels (Optional) A list of labels for the DataSet in the following form:
    * `[ { value: "Something", language: "en" }, { value: "Etwas", language: "de" }, … ]`
    * @param options.languages Languages in which to get the labels, by priority, e.g. `["de", "en"]`.
    */
  constructor(
    endpoint: string,
    options: IDataSetOptions,
  ) {
    const { iri, labels, graphIri } = options;
    this.fetcher = new SparqlFetcher(endpoint);
    this.endpoint = endpoint;
    this.iri = iri.value;
    this.graphIri = graphIri.value;
    this.labels = labels || [];
    this.languages = options.languages || ["de", "it"];
    this.cachedComponents = {
      dimensions: new Map(),
      measures: new Map(),
      attributes: new Map(),
    };
  }

  /**
   * Serializes a DataSet to JSON in a way that makes it deserializable
   * by calling DataSet#fromJSON
   */
  public toJSON(): string {
    const dimensions = Array.from(this.cachedComponents.dimensions.values())
      .map((component) => component.toJSON());
    const measures = Array.from(this.cachedComponents.measures.values())
      .map((component) => component.toJSON());
    const attributes = Array.from(this.cachedComponents.attributes.values())
      .map((component) => component.toJSON());
    const obj: SerializedDataSet = {
      endpoint: this.endpoint,
      iri: this.iri,
      graphIri: this.graphIri,
      labels: this.labels,
      languages: this.languages,
      components: {
        dimensions,
        measures,
        attributes,
      },
    };
    return JSON.stringify(obj);
  }

  /**
   * Fetch all [[Attribute]]s from the DataSet.
   */
  public async attributes(): Promise<Attribute[]> {
    await this.components();
    return Array.from(this.cachedComponents.attributes.values());
  }

  /**
   * Fetch all [[Dimension]]s from the DataSet.
   */
  public async dimensions(): Promise<Dimension[]> {
    await this.components();
    return Array.from(this.cachedComponents.dimensions.values());
  }

  /**
   * Fetch all [[Measure]]s from the DataSet.
   */
  public async measures(): Promise<Measure[]> {
    await this.components();
    return Array.from(this.cachedComponents.measures.values());
  }

  /**
   * Start a new query on the DataSet.
   */
  public query(opts: IQueryOptions = {}): DataSetQuery {
    if (!opts.languages) {
      opts.languages = this.languages;
    }
    return new DataSetQuery(this, opts);
  }

  private async components() {
    if (this.componentsLoaded) {
      return;
    }

    const binding = variable("iri");
    const labelBinding = variable("label");

    const query: SelectQuery = {
      prefixes,
      queryType: "SELECT",
      variables: [
        binding,
        variable("kind"),
        labelBinding,
      ],
      from: { default: [ namedNode(this.graphIri) ], named: [] },
      where: [
        {
          type: "bgp",
          triples: [
            {
              subject: namedNode(this.iri),
              predicate: namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
              object: namedNode("http://purl.org/linked-data/cube#DataSet"),
            },
            {
              subject: namedNode(this.iri),
              predicate: {
                type: "path",
                pathType: "/",
                items: [
                  namedNode("http://purl.org/linked-data/cube#structure"),
                  namedNode("http://purl.org/linked-data/cube#component"),
                ],
              },
              object: variable("componentSpec"),
            },
            {
              subject: variable("componentSpec"),
              predicate: variable("kind"),
              object: binding,
            },
          ],
        },
        {
          type: "filter",
          expression: {
            type: "operation",
            operator: "in",
            args: [
              variable("kind"),
              [
                namedNode("http://purl.org/linked-data/cube#attribute"),
                namedNode("http://purl.org/linked-data/cube#dimension"),
                namedNode("http://purl.org/linked-data/cube#measure"),
              ],
            ],
          },
        },
        ...generateLangOptionals(binding, labelBinding, this.languages),
        generateLangCoalesce(labelBinding, this.languages),
      ],
      type: "query",
    };

    const generator = new SparqlGenerator({ allPrefixes: true });
    const sparql = generator.stringify(query);

    const components = await this.fetcher.select(sparql);
    const componentsByIri = components.reduce((acc, { kind, label, iri }) => {
      if (!acc[iri.value]) {
        acc[iri.value] = {
          kind,
          labels: [],
          iri,
        };
      }
      acc[iri.value].labels.push({
        value: label.value,
        language: label.language,
      });
      return acc;
    }, {});
    const groupedComponents: GroupedComponents[] = Object.values(componentsByIri);

    this.cachedComponents = groupedComponents
      .reduce((componentsProp: ComponentsCache, { kind, labels, iri }) => {
        switch (kind.value) {
          case "http://purl.org/linked-data/cube#attribute":
            componentsProp.attributes.set(iri.value, new Attribute({ labels, iri }));
            break;
          case "http://purl.org/linked-data/cube#dimension":
            componentsProp.dimensions.set(iri.value, new Dimension({ labels, iri }));
            break;
          case "http://purl.org/linked-data/cube#measure":
            componentsProp.measures.set(iri.value, new Measure({ labels, iri }));
            break;
          default:
            throw new Error(`Unknown component kind ${kind.value}`);
        }
        return componentsProp;
      }, {
        attributes: new Map(),
        dimensions: new Map(),
        measures: new Map(),
      });

    this.componentsLoaded = true;
  }
}

export default DataSet;
