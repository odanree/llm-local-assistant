const fs = require('fs');
const coverage = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));

const files = Object.entries(coverage).map(([path, data]) => {
  const statements = data.s || {};
  const stmtCount = Object.keys(statements).length;
  const coverage_pct = data.summary?.statements?.pct || 0;
  const shortPath = path.includes('src\\') ? path.split('src\\')[1] : path.split('\\').pop();
  return {
    path: shortPath,
    statements: stmtCount,
    coverage: coverage_pct,
    potential: stmtCount * (100 - coverage_pct)
  };
}).filter(f => f.coverage < 90).sort((a, b) => b.potential - a.potential).slice(0, 15);

console.log('\n=== TOP 15 FILES WITH LOWEST COVERAGE (< 90%) BY ROI ===\n');
console.log('File | Statements | Coverage | ROI Score');
console.log('-'.repeat(70));
files.forEach((f, i) => {
  console.log(`${(i+1).toString().padEnd(2)}. ${f.path.padEnd(40)} | ${f.statements.toString().padEnd(10)} | ${f.coverage.toFixed(2).padEnd(8)}% | ${Math.round(f.potential).toString().padEnd(8)}`);
});
