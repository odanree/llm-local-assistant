const fs = require('fs');
const c = JSON.parse(fs.readFileSync('coverage/coverage-final.json', 'utf8'));

const files = Object.entries(c).map(([path, data]) => {
  const stmts = data.s || {};
  const total = Object.keys(stmts).length;
  const covered = Object.values(stmts).filter(v => v > 0).length;
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0;
  
  let shortPath = path;
  if (path.includes('src\\')) {
    shortPath = path.split('src\\')[1];
  } else if (path.includes('src/')) {
    shortPath = path.split('src/')[1];
  }
  
  return { 
    shortPath, 
    total, 
    covered, 
    pct, 
    gap: 100 - pct,
    roi: total * (100 - pct) 
  };
})
.filter(f => f.pct < 90 && f.shortPath && f.total > 50)
.sort((a,b) => b.roi - a.roi)
.slice(0, 15);

console.log('\n=== TOP 15 HIGH-ROI FILES FOR TESTING (< 90% Coverage) ===\n');
console.log('Rank | File Name                         | Statements | Coverage | Gap | ROI Score');
console.log('-'.repeat(90));

files.forEach((f, i) => {
  const num = (i+1).toString().padStart(2);
  const name = f.shortPath.padEnd(35);
  const stmts = f.total.toString().padStart(10);
  const cov = f.pct.toString().padStart(3);
  const gap = f.gap.toString().padStart(3);
  const roi = Math.round(f.roi).toString().padStart(8);
  
  console.log(`${num}. | ${name} | ${stmts} | ${cov}% | ${gap}% | ${roi}`);
});

console.log('\n=== TOP 3 RECOMMENDATIONS ===\n');
console.log('1. ' + files[0].shortPath);
console.log(`   - Size: ${files[0].total} statements | Coverage: ${files[0].pct}% | ROI: ${Math.round(files[0].roi)}`);
console.log(`   - Testing opportunity: ${files[0].gap}% gap to overcome = ${Math.round(files[0].roi / 50)} tests needed (est 50 stmts per test)\n`);

console.log('2. ' + files[1].shortPath);
console.log(`   - Size: ${files[1].total} statements | Coverage: ${files[1].pct}% | ROI: ${Math.round(files[1].roi)}`);
console.log(`   - Testing opportunity: ${files[1].gap}% gap to overcome = ${Math.round(files[1].roi / 50)} tests needed (est 50 stmts per test)\n`);

console.log('3. ' + files[2].shortPath);
console.log(`   - Size: ${files[2].total} statements | Coverage: ${files[2].pct}% | ROI: ${Math.round(files[2].roi)}`);
console.log(`   - Testing opportunity: ${files[2].gap}% gap to overcome = ${Math.round(files[2].roi / 50)} tests needed (est 50 stmts per test)\n`);
