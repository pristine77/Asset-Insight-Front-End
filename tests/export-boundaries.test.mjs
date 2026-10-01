import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const projects = ['assetinsight-admin', 'assetinsight-app', 'assetinsight-client'];

test('each application retains its independent package and lockfile', () => {
  for (const project of projects) {
    const pkg = JSON.parse(read(`${project}/package.json`));
    const lock = JSON.parse(read(`${project}/package-lock.json`));
    assert.deepEqual(pkg.dependencies, lock.packages[''].dependencies);
    assert.deepEqual(pkg.devDependencies, lock.packages[''].devDependencies);
    assert.ok(pkg.scripts.build || pkg.scripts['android-build']);
    assert.equal(existsSync(path.join(root, project, '.git')), false);
  }
});

test('runtime routes named coverage and artifacts are retained', () => {
  assert.match(read('assetinsight-client/app/(main)/crm/coverage/page.tsx'), /CrmWorkspace page="coverage"/);
  assert.match(read('assetinsight-admin/app/api/admin/released-appraisals/[id]/artifacts/[kind]/download/route.ts'), /proxyStreamWithAdminAuth/);
});

test('admin has no accounting panel, warning helper or accounting BFF routes', () => {
  for (const file of [
    'app/components/dashboard/DashboardCredits.tsx', 'lib/creditWarnings.ts',
    'app/api/admin/openai-credits/route.ts', 'app/api/admin/openai-credits/sync/route.ts',
  ]) assert.equal(existsSync(path.join(root, 'assetinsight-admin', file)), false);
  assert.doesNotMatch(read('assetinsight-admin/app/components/dashboard/DashboardShellV2.tsx'), /DashboardCredits|openai-credits/);
});

test('research remains explicit without monetary allowance or multiplier claims', () => {
  for (const file of [
    'assetinsight-client/components/reports/SalvagePreviewWorkspace.tsx',
    'assetinsight-app/src/screens/SalvagePreviewScreen.tsx',
  ]) {
    const source = read(file);
    assert.match(source, /15 minutes/);
    assert.match(source, /Ordinary saves do not run research/);
    assert.doesNotMatch(source, /US\$10|usage multiplier|provider-cost allowance|processing-cost allowance|paid research/);
  }
});

test('application source has no provider-accounting configuration or persistence', () => {
  function inspect(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) inspect(file);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(file) && !/\.(?:test|spec)\./.test(file)) {
        assert.doesNotMatch(readFileSync(file, 'utf8'),
          /openai-credits|OPENAI_(?:CREDIT|USAGE|PRICE)|providerCostUsd|spentUsd|chargedUsd|reservedUsd|budgetUsd|usage_multiplier/,
          path.relative(root, file));
      }
    }
  }
  for (const folder of ['assetinsight-admin/app', 'assetinsight-admin/lib', 'assetinsight-client/app', 'assetinsight-client/components', 'assetinsight-client/services', 'assetinsight-app/src']) inspect(path.join(root, folder));
});
