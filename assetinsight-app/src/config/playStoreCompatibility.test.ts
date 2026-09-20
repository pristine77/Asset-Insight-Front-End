import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');

function readJson(relativePath: string): any {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

describe('Google Play production compatibility', () => {
  it('blocks external package installation even when a native dependency requests it', () => {
    const appConfig = readJson('app.json');
    const manifest = fs.readFileSync(
      path.join(projectRoot, 'android/app/src/main/AndroidManifest.xml'),
      'utf8'
    );

    expect(appConfig.expo.android.permissions).not.toContain(
      'android.permission.REQUEST_INSTALL_PACKAGES'
    );
    expect(appConfig.expo.android.blockedPermissions).toContain(
      'android.permission.REQUEST_INSTALL_PACKAGES'
    );
    const installPermissionDeclarations = (manifest.match(/<uses-permission\b[^>]*>/g) || [])
      .filter((declaration) =>
        declaration.includes('android:name="android.permission.REQUEST_INSTALL_PACKAGES"')
      );
    expect(installPermissionDeclarations).toHaveLength(1);
    expect(installPermissionDeclarations[0]).toContain('tools:node="remove"');
  });

  it('uses remotely managed, auto-incrementing production build versions', () => {
    const easConfig = readJson('eas.json');

    expect(easConfig.cli.appVersionSource).toBe('remote');
    expect(easConfig.build.production.autoIncrement).toBe(true);
  });

  it('does not ship the custom APK installer dependency', () => {
    const packageJson = readJson('package.json');
    const appSource = fs.readFileSync(path.join(projectRoot, 'App.tsx'), 'utf8');

    expect(packageJson.dependencies).not.toHaveProperty('expo-intent-launcher');
    expect(appSource).not.toContain('AppUpdatePrompt');
    expect(fs.existsSync(path.join(projectRoot, 'src/components/AppUpdatePrompt.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'src/services/appVersionService.ts'))).toBe(false);
  });
});
