const fs = require("fs");
const path = require("path");
const bundle = require("../kapso/functions/_bundle_all_functions.js");

async function main() {
  console.log("Bundle exports:", Object.keys(bundle));
}

main().catch(console.error);
