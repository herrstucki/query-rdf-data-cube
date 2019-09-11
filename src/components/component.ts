// tslint:disable max-classes-per-file
import { namedNode } from "@rdfjs/data-model";
import clone from "clone";
import { Term } from "rdf-js";
import { Label } from "../datacube";
import { BaseExpr, Binding, IExpr } from "../expressions";

export type SerializedComponent = {
  componentType: string,
  iri: string,
  labels: Label[],
};

export class Component extends BaseExpr {
  /**
   * Deserializes a Component from JSON generated by Component#toJSON
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

  public labels: Label[];
  public iri: Term;
  public aggregateType: string;
  public isDistinct: boolean = false;
  public descending: boolean = false;
  public componentType: string = "";

  constructor({ labels, iri }: { labels: Label[], iri: string | Term}) {
    super();

    this.labels = labels || [];
    if (typeof iri === "string") {
      this.iri = namedNode(iri);
    } else {
      this.iri = iri;
    }
  }

  /**
   * Serializes a Component to JSON in a way that makes it deserializable
   * by calling Component#fromJSON
   */
  public toJSON(): string {
    const obj: SerializedComponent = {
      componentType: this.componentType,
      iri: this.iri.value,
      labels: this.labels,
    };
    return JSON.stringify(obj);
  }

  public clone() {
    const Constructor = Object.getPrototypeOf(this).constructor;
    const state = {labels: clone(this.labels), iri: this.iri};
    const instance = new Constructor(state);
    instance.aggregateType = this.aggregateType;
    instance.isDistinct = this.isDistinct;
    instance.descending = this.descending;
    return instance;
  }

  public avg() {
    const self = this.clone();
    self.aggregateType = "avg";
    return self;
  }

  public distinct() {
    const self = this.clone();
    self.isDistinct = true;
    return self;
  }

  public desc() {
    const self = this.clone();
    self.descending = true;
    return self;
  }

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
