// Blokkeert een globale installatie (npm i -g). Deze CLI draai je per project:
//   npx github:DafkeDD/ProjectX-cli
if (process.env.npm_config_global === "true") {
  console.error(
    "\n  projectx-cli installeer je niet globaal.\n" +
      "  Ga naar je projectmap en draai:\n\n" +
      "    npx github:DafkeDD/ProjectX-cli\n",
  );
  process.exit(1);
}
