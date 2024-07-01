const fs = require("fs");
const path = require("path");

const packages = [
  "../packages/p2p-media-loader-core/package.json",
  "../packages/p2p-media-loader-hlsjs/package.json",
  "../packages/p2p-media-loader-shaka/package.json",
  "../packages/p2p-media-loader-demo/package.json",
];

const versionFile = "../packages/p2p-media-loader-core/src/utils/version.ts";

function updateVersionFile(versionFilePath, newVersion) {
  const fullPath = path.resolve(versionFilePath);
  let fileContent = fs.readFileSync(fullPath, "utf8");

  fileContent = fileContent.replace(/"(.*?)"/, `"${newVersion}"`);

  fs.writeFileSync(fullPath, fileContent);
}

function updateVersion(packagePath, newVersion) {
  const fullPath = path.resolve(packagePath);
  const packageJson = require(fullPath);
  const updatedPackageJson = { ...packageJson, version: newVersion };
  fs.writeFileSync(
    fullPath,
    JSON.stringify(updatedPackageJson, null, 2) + "\n",
  );
}

function main() {
  const newVersion = process.env.TAG;
  if (!newVersion) {
    console.error(
      "ERROR: No version provided. Please set the TAG environment variable.",
    );
    process.exit(1);
  }

  packages.forEach((packagePath) => {
    updateVersion(packagePath, newVersion);
    console.log(`Updated ${packagePath} to version ${newVersion}`);
  });

  updateVersionFile(versionFile, newVersion);
  console.log(`Updated ${versionFile} to version ${newVersion}`);
}

main();
