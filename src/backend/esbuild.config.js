// esbuild.config.js
const esbuild = require('esbuild')

esbuild.build({
  entryPoints: ["index.js"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "../../dist/backend/index.js",
}).then(() => {
  console.log("✅ Build complete")
}).catch(() => process.exit(1))
