// tslint:disable max-classes-per-file
import { namedNode } from "@rdfjs/data-model";
import clone from "clone";
import { Term } from "rdf-js";
import { Label } from "../datacube";
import { BaseExpr, Binding, IExpr } from "../expressions";

export type SerializedComponent = {
  componentType: string,
  iri: string,
  label: Label,
  extraMetadata: object,
};

/**
 * @class [[Component]] is implemented by [[Dimension]], [[Attribute]] and [[Measure]].
 * @export
 * @abstract
 * @extends {BaseExpr}
 *
 * > A cube is organized according to a set of *dimensions*, *attributes* and *measures*.
 * We collectively call these *components*.
 * Source: <https://www.w3.org/TR/vocab-data-cube/#cubes-model>.
 *
 * Each of them inherits from all filter operators:
 *
 * ```js
 * const priceMeasure = new Measure({
 *   iri: "http://example.com/price",
 *   label: { value: "Price", language: "en" },
 * });
 *
 * const query = dataCube
 *   .query()
 *   .select({ price: priceMeasure })
 *   .filter(({ price }) => price.lte(30.5));
 * ```
 *
 * Generated query will have this `FILTER` clause:
 * ```sparql
 * FILTER(?price <= \\"30.5\\"^^xsd:decimal)
 * ```
 */
export abstract class Component extends BaseExpr {
  /**
   * Deserializes a Component from JSON generated by [[toJSON]]
   *
   * @static
   * @param {string} json
   * @returns {Component}
   * @memberof Component
   */
  public static fromJSON(json: string): Component {
    const obj = JSON.parse(json);
    obj.iri = namedNode(obj.iri);
    switch (obj.componentType) {
      case "measure":
        return new Measure(obj);
      case "dimension":
          return new Dimension(obj);
      case "attribute":
          return new Attribute(obj);
    }
    throw new Error(`Unknown component type '${obj.componentType}'`);
  }

  public label: Label;
  public iri: Term;
  public extraMetadata: {[key: string]: Term} = {};
  public aggregateType: string;
  public isDistinct: boolean = false;
  public descending: boolean = false;
  public componentType: string = "";
  public broaderComponent?: Component;
  public narrowerComponent?: Component;

  /**
   * Creates an instance of Component.
   * Classes [[Dimension]], [[Attribute]] and [[Measure]] inherit from this [[Component]] abstract class.
   *
   * ```js
   * const priceMeasure = new Measure({
   *   iri: "http://example.com/price", label: { value: "Price", language: "en" }
   * });
   * ```
   *
   * @param {({ label?: Label, iri: string | Term})} options Additional info about the component.
   * @param options.iri - The IRI of the Component.
   * @param options.label (Optional) A label for the DataCube in the following form:
   * `{ value: "Something", language: "en" }`
   * @memberof Component
   */
  constructor(options: { iri: string | Term, label?: Label, extraMetadata?: object }) {
    super();

    const iri = options.iri;
    if (typeof iri === "string") {
      this.iri = namedNode(iri);
    } else {
      this.iri = iri;
    }
    Object.assign(this.extraMetadata, options.extraMetadata || {});

    this.label = options.label;
  }

  /**
   * Serializes a Component to JSON in a way that makes it deserializable
   * by calling [[fromJSON]]
   * @memberof Component
   */
  public toJSON(): string {
    const obj: SerializedComponent = {
      componentType: this.componentType,
      iri: this.iri.value,
      label: this.label,
      extraMetadata: this.extraMetadata,
    };
    return JSON.stringify(obj);
  }

  /**
   * @ignore
   */
  public clone() {
    const Constructor = Object.getPrototypeOf(this).constructor;
    const state = {label: clone(this.label), iri: this.iri};
    const instance = new Constructor(state);
    instance.aggregateType = this.aggregateType;
    instance.isDistinct = this.isDistinct;
    instance.descending = this.descending;
    return instance;
  }

  /**
   * Used in [[select]], [[avg]] calculates the average value.
   * It automatically generates the corresponding [[groupBy]] clause.
   * An average value can be filter with [[having]].
   *
   * ```js
   * const priceMeasure = new Measure({
   *   iri: "http://example.com/price", labels: [{ value: "Price", language: "en" }]
   * });
   * dataCube.query().select({
   *   price: priceMeasure.avg(),
   * });
   * ```
   *
   * @memberof Component
   */
  public avg() {
    const self = this.clone();
    self.aggregateType = "avg";
    return self;
  }

  /**
   * Used in [[select]], [[distinct]] asks for distinct values.
   *
   * ```js
   * const cityDimension = new Dimension({
   *   iri: "http://example.com/city", labels: [{ value: "City", language: "en" }]
   * });
   * dataCube.query().select({
   *   city: cityDimension.distinct(),
   * });
   * ```
   * @memberof Component
   */
  public distinct() {
    const self = this.clone();
    self.isDistinct = true;
    return self;
  }

  /**
   * Used in [[select]], [[distinct]] asks for distinct values.
   *
   * ```js
   * const priceMeasure = new Measure({
   *   iri: "http://example.com/price", labels: [{ value: "Price", language: "en" }]
   * });
   * dataCube.query().select({
   *   price: priceMeasure
   * }).orderBy(({ price } => price.lte(30.5)));
   * ```
   *
   * @memberof Component
   */
  public desc() {
    const self = this.clone();
    self.descending = true;
    return self;
  }

  public broader(iri: string = "") {
    let component: Attribute | Dimension | Measure;
    switch (this.componentType) {
      case "attribute":
        component = new Attribute({ iri });
        break;
      case "dimension":
        component = new Dimension({ iri });
        break;
      case "measure":
        component = new Measure({ iri });
        break;
      default:
        throw new Error("Cannot get broader of abstract Component");
    }
    this.broaderComponent = component;
    component.narrowerComponent = this;
    return component;
  }

  /**
   * Mechanism resolving a Component to the corresponding binding name, used when the SPARQL query gets generated.
   *
   * @param {Map<string, string>} mapping
   * @returns {IExpr}
   * @memberof Component
   */
  public resolve(mapping: Map<string, string>): IExpr {
    return new Binding(mapping.get(this.iri.value));
  }
}

export class Attribute extends Component {
  public componentType = "attribute";
}

export class Dimension extends Component {
  public componentType = "dimension";
}

export class Measure extends Component {
  public componentType = "measure";
}

/**
 * @ignore
 */
export function isComponent(component: any): component is Component {
  return (
    component instanceof Attribute ||
    component instanceof Dimension ||
    component instanceof Measure
  );
}
