import {
  Config,
  JdkHelper,
  AndroidSdkTools,
  TwaGenerator,
  TwaManifest,
  ConsoleLog,
  JarSigner
} from '@bubblewrap/core';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function build() {
  const log = new ConsoleLog();
  
  // 1. Setup config using environment variables (installed by GitHub Actions)
  const jdkPath = process.env.JAVA_HOME;
  const sdkPath = process.env.ANDROID_HOME;
  
  if (!jdkPath || !sdkPath) {
    throw new Error('JAVA_HOME or ANDROID_HOME not set.');
  }
  
  log.info(`Using JDK: ${jdkPath}`);
  log.info(`Using SDK: ${sdkPath}`);
  
  const javaConfig = new Config(jdkPath, sdkPath);
  const jdkHelper = new JdkHelper(process, javaConfig);
  const androidSdkTools = new AndroidSdkTools(process, javaConfig, jdkHelper);
  
  // 2. Read the existing twa-manifest.json
  const manifestPath = path.join(process.cwd(), 'twa-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('twa-manifest.json not found in current directory.');
  }
  
  const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  
  // Need a signing key path - we'll generate an unsigned APK first,
  // then sign it with our real keystore later using apksigner.
  // Bubblewrap requires the 'signingKey' field to exist in the manifest though.
  manifestJson.signingKey = {
    path: 'temp.keystore', 
    alias: 'android'
  };
  
  const twaManifest = new TwaManifest(manifestJson);
  
  // 3. Generate Android Project
  log.info('Generating Android project...');
  const twaGenerator = new TwaGenerator();
  await twaGenerator.createTwaProject(process.cwd(), twaManifest, log);
  log.info('Android project generated successfully.');
  
  // 4. Build the project using Gradle Wrapper
  log.info('Building APK via Gradle...');
  
  // We don't use the Bubblewrap buildApk wrapper because it requires signing
  // We'll run the gradle wrapper directly to build an unsigned release APK
  // which we will sign manually afterwards.
  
  const isWindows = process.platform === 'win32';
  const gradlew = isWindows ? 'gradlew.bat' : './gradlew';
  
  if (!isWindows) {
    fs.chmodSync(gradlew, '755');
  }
  
  log.info('Running assembleRelease...');
  execSync(`${gradlew} assembleRelease`, { stdio: 'inherit' });
  log.info('Build complete.');
}

build().catch(err => {
  console.error('\n❌ Build failed:', err);
  process.exit(1);
});
