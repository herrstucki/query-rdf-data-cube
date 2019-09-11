import { literal, namedNode } from "@rdfjs/data-model";
import { Attribute, Dimension, Measure } from "../src/components";
import { DataCube} from "../src/datacube";
import { DataCubeEntryPoint } from "../src/entrypoint";
import { fetch } from "./utils/fetch-mock";

const betriebsartDimension = new Dimension({
  labels: [{ value: "Betriebsart", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/property/BTA",
});
const geschlechtDimension = new Dimension({
  labels: [{ value: "Geschlecht", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/property/SEX",
});
const raumDimension = new Dimension({
  labels: [{ value: "Raum", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/property/RAUM",
});
const zeitDimension = new Dimension({
  labels: [{ value: "Zeit", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/property/ZEIT",
});
const beschaeftigteMeasure = new Measure({
  labels: [{ value: "Beschäftigte", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/measure/BES",
});
const quelleAttribute = new Attribute({
  labels: [{ value: "Quelle", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/attribute/QUELLE",
});
const glossarAttribute = new Attribute({
  labels: [{ value: "Glossar", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/attribute/GLOSSAR",
});
const fussnoteAttribute = new Attribute({
  labels: [{ value: "Fussnote", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/attribute/FUSSNOTE",
});
const datenstandAttribute = new Attribute({
  labels: [{ value: "Datenstand", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/attribute/DATENSTAND",
});
const erwarteteAktualisierungAttribute = new Attribute({
  labels: [{ value: "Erwartete Aktualisierung", language: "" }],
  iri:
    "https://ld.stadt-zuerich.ch/statistics/attribute/ERWARTETE_AKTUALISIERUNG",
});
const korrekturAttribute = new Attribute({
  labels: [{ value: "Korrektur", language: "" }],
  iri: "https://ld.stadt-zuerich.ch/statistics/attribute/KORREKTUR",
});

const datacube: DataCube = new DataCube("https://ld.stadt-zuerich.ch/query", {
  iri: namedNode(
    "https://ld.stadt-zuerich.ch/statistics/dataset/BES-RAUM-ZEIT-BTA-SEX",
  ),
  labels: [
    {
      value: "Beschäftigte nach Betriebsart, Raum, Geschlecht, Zeit",
      language: "de",
    },
  ],
  graphIri: namedNode("https://linked.opendata.swiss/graph/zh/statistics"),
  fetcher: {
    fetch,
  },
});

test("basic", async () => {
  const query = datacube.query().select({
    betriebsart: betriebsartDimension,
    geschlecht: geschlechtDimension,
    raum: raumDimension,
    zeit: zeitDimension,

    bep: beschaeftigteMeasure,

    quelle: quelleAttribute,
    glossar: glossarAttribute,
    fussnote: fussnoteAttribute,
    datenstand: datenstandAttribute,
    erwarteteAktualisierung: erwarteteAktualisierungAttribute,
    korrektur: korrekturAttribute,
  });
  const sparql = await query.toSparql();
  expect(sparql).toMatchSnapshot();
});

describe("select", () => {
  test("throws helpful message on falsy components", async () => {
    const query = datacube.query();
    expect(() =>
      query.select({
        betriebsart: betriebsartDimension,
        geschlecht: geschlechtDimension,
        raum: null,
        zeit: zeitDimension,
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
"Invalid Component in
\`.select({ raum: someFalsyValue })\`
                 ^^^^^^^^^^^^^^"
`);
  });
});

test("distinct", async () => {
  const query = datacube.query().select({
    raum: raumDimension.distinct(),
  });
  const sparql = await query.toSparql();
  expect(sparql).toMatchSnapshot();
});

test("empty select", async () => {
  const query = datacube.query();
  const sparql = await query.toSparql();
  expect(sparql).toMatchSnapshot();
});

describe("avg", () => {
  test("avg", async () => {
    const query = datacube.query().select({
      raum: raumDimension,
      bep: beschaeftigteMeasure.avg(),
    });
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });

  test("avg and filter", async () => {
    const query = datacube
      .query()
      .select({
        raum: raumDimension,
        bep: beschaeftigteMeasure.avg(),
      })
      .filter(raumDimension.not.in([namedNode("http://foo")]))
      .offset(150)
      .limit(50);
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });

  test("avg has auto groupBy", async () => {
    const sparqlA = await datacube
      .query()
      .select({
        raum: raumDimension,
        bep: beschaeftigteMeasure.avg(),
      })
      .groupBy("raum")
      .toSparql();
    const sparqlB = await datacube
      .query()
      .select({
        raum: raumDimension,
        bep: beschaeftigteMeasure.avg(),
      })
      .toSparql();
    expect(sparqlA).toBe(sparqlB);
  });

  test("avg distinct", async () => {
    const query = datacube.query().select({
      betriebsart: betriebsartDimension,
      geschlecht: geschlechtDimension,
      raum: raumDimension,
      zeit: zeitDimension,

      bep: beschaeftigteMeasure.avg().distinct(),

      quelle: quelleAttribute,
      glossar: glossarAttribute,
      fussnote: fussnoteAttribute,
      datenstand: datenstandAttribute,
      erwarteteAktualisierung: erwarteteAktualisierungAttribute,
      korrektur: korrekturAttribute,
    });
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });
});

describe("groupBy", () => {
  test("with avg doesn't duplicate groupby vars", async () => {
    const query = datacube
      .query()
      .select({
        raum: raumDimension,
        zeit: zeitDimension,

        bep: beschaeftigteMeasure.avg().distinct(),
      })
      .filter(raumDimension.equals("http://something/R3000"))
      .groupBy("zeit")
      .groupBy(({ raum }) => raum);
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });

  test("groups with a function", async () => {
    const query = datacube
      .query()
      .select({
        betriebsart: betriebsartDimension,
        geschlecht: geschlechtDimension,
        raum: raumDimension,
        zeit: zeitDimension,

        bep: beschaeftigteMeasure,

        quelle: quelleAttribute,
        glossar: glossarAttribute,
        fussnote: fussnoteAttribute,
      })
      .groupBy(({ zeit }) => zeit)
      .groupBy(({ raum }) => raum);
    // .having(({ bep }) => bep.gte(10000))
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });

  test("groups with strings", async () => {
    const base = datacube.query().select({
      betriebsart: betriebsartDimension,
      geschlecht: geschlechtDimension,
      raum: raumDimension,
      zeit: zeitDimension,

      bep: beschaeftigteMeasure,

      quelle: quelleAttribute,
      glossar: glossarAttribute,
      fussnote: fussnoteAttribute,
    });
    const queryA = base.groupBy(({ zeit }) => zeit).groupBy(({ raum }) => raum);
    const queryB = base.groupBy("zeit").groupBy("raum");
    const sparqlA = await queryA.toSparql();
    const sparqlB = await queryB.toSparql();
    expect(sparqlA).toBe(sparqlB);
  });

  test("reports error when grouping on unknown component", async () => {
    const base = datacube.query().select({
      betriebsart: betriebsartDimension,
    });
    const query = base.groupBy("foobarbaz");
    expect(query.toSparql()).rejects.toMatchInlineSnapshot(
      `[Error: Cannot group on 'foobarbaz': no component with this name.]`,
    );
  });

  test("doesn't duplicate", async () => {
    const query = datacube
      .query()
      .select({
        betriebsart: betriebsartDimension,
        geschlecht: geschlechtDimension,
        raum: raumDimension,
        zeit: zeitDimension,

        bep: beschaeftigteMeasure,

        quelle: quelleAttribute,
        glossar: glossarAttribute,
        fussnote: fussnoteAttribute,
      })
      .groupBy("zeit")
      .groupBy(({ zeit }) => zeit)
      .groupBy(({ zeit }) => zeit)
      .groupBy("raum")
      .groupBy(({ raum }) => raum);
    // .having(({ bep }) => bep.gte(10000))
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });
});

test("group and filter", async () => {
  const base = datacube.query().select({
    betriebsart: betriebsartDimension,
    geschlecht: geschlechtDimension,
    raum: raumDimension,
    zeit: zeitDimension,

    bep: beschaeftigteMeasure,

    quelle: quelleAttribute,
    glossar: glossarAttribute,
    fussnote: fussnoteAttribute,
  });
  const query = base
    .filter(raumDimension.gte(literal("12")))
    .filter(beschaeftigteMeasure.gte(literal("12")))
    .groupBy(({ zeit }) => zeit)
    .groupBy(({ raum }) => raum);
  const sparql = await query.toSparql();
  expect(sparql).toMatchSnapshot();
});

describe("ordering", () => {
  test("group and filter", async () => {
    const base = datacube.query().select({
      betriebsart: betriebsartDimension,
      geschlecht: geschlechtDimension,
      raum: raumDimension,
      zeit: zeitDimension,

      bep: beschaeftigteMeasure,

      quelle: quelleAttribute,
      glossar: glossarAttribute,
      fussnote: fussnoteAttribute,
    });
    const query = base
      .filter(raumDimension.gte(literal("12")))
      .filter(beschaeftigteMeasure.gte(literal("12")))
      .groupBy(({ zeit }) => zeit)
      .groupBy(({ raum }) => raum)
      .orderBy(quelleAttribute.desc())
      .orderBy(raumDimension);
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });

  test("one or many give same sparql", async () => {
    const base = datacube.query().select({
      raum: raumDimension,
      zeit: zeitDimension,
    });
    const queryBase = base
      .filter(raumDimension.gte(literal("12")))
      .groupBy(({ zeit }) => zeit)
      .groupBy(({ raum }) => raum);
    const queryA = queryBase
      .orderBy(zeitDimension.desc())
      .orderBy(raumDimension);
    const queryB = queryBase.orderBy(zeitDimension.desc(), raumDimension);
    const sparqlA = await queryA.toSparql();
    const sparqlB = await queryB.toSparql();
    expect(sparqlA).toBe(sparqlB);
  });

  test("are ordered", async () => {
    const base = datacube.query().select({
      raum: raumDimension,
      zeit: zeitDimension,
    });
    const queryBase = base.filter(raumDimension.gte(literal("12")));
    const queryA = queryBase.orderBy(raumDimension, zeitDimension.desc());
    const queryB = queryBase.orderBy(zeitDimension.desc(), raumDimension);
    const sparqlA = await queryA.toSparql();
    const sparqlB = await queryB.toSparql();
    expect(sparqlA).not.toBe(sparqlB);
    expect(sparqlA).toContain("ORDER BY");
    expect(sparqlA).toContain("ORDER BY");
  });
});

describe("handles languages", () => {
  test("one language", async () => {
    const query = datacube.query({ languages: ["en"] }).select({
      zeit: zeitDimension,

      bep: beschaeftigteMeasure,

      quelle: quelleAttribute,
    });
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });

  test("two languages", async () => {
    const query = datacube.query({ languages: ["en", "de"] }).select({
      zeit: zeitDimension,

      bep: beschaeftigteMeasure,

      quelle: quelleAttribute,
    });
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
  });

  test("three languages", async () => {
    const query = datacube.query({ languages: ["fr", "de", "it"] }).select({
      zeit: zeitDimension,

      bep: beschaeftigteMeasure,

      quelle: quelleAttribute,
    });
    const sparql = await query.toSparql();
    expect(sparql).toMatchSnapshot();
    expect(await query.execute()).toMatchSnapshot();
  });
});

describe.skip("execute", () => {
  it("returns results", async () => {
    const entryPoint = new DataCubeEntryPoint(
      "https://trifid-lindas.test.cluster.ldbar.ch/query",
      {
        languages: ["fr", "de"],
        fetcher: {
          fetch,
        },
      },
    );
    // find all its dataCubes
    const dataCubes = await entryPoint.dataCubes();
    // we'll work with one of them
    const ds = dataCubes[0];

    const dimensions = await ds.dimensions();
    const measures = await ds.measures();

    const variable = dimensions[0];
    const size = dimensions[1];
    const canton = dimensions[2];

    const query = ds
      .query()
      .select({
        mes: measures[0],
        variable,
        size,
        canton,
      })
      .limit(2);
    expect(await query.execute()).toMatchSnapshot();
  });
});
