import test from "node:test";
import assert from "node:assert/strict";

import { MarkdownBlockService } from "../src/services/MarkdownBlockService";

test("extracts standalone memo tags, links, and images", () => {
	const metadata = new MarkdownBlockService().parseMemoMetadata(
		"First line #tag\n[[Target]] ![[Assets/photo%20one.jpg|300]] [site](https://example.com)",
	);

	assert.deepEqual(metadata.tags, ["tag"]);
	assert.deepEqual(metadata.images, [{
		path: "Assets/photo one.jpg",
		altText: "",
		syntax: "obsidian_embed",
	}]);
	assert.deepEqual(metadata.links, [
		{ target: "Target", displayText: null, syntax: "wiki_link" },
		{ target: "https://example.com", displayText: "site", syntax: "markdown_link" },
	]);
});
