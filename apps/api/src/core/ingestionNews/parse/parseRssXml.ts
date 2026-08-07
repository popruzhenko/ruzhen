import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    cdataPropName: "__cdata",
});

export function parseRssXml(xml: string): unknown {
    return parser.parse(xml);
}