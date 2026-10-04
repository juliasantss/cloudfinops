import { readFileSync } from 'fs';
import * as m from '../js/core/metrics.js';
import * as a from '../js/core/allocation.js';
import * as f from '../js/core/focus.js';

const db = JSON.parse(readFileSync('./api/db.json', 'utf8'));
const jul = db.charges.filter(c => c.month === '2026-07');
const ago = db.charges.filter(c => c.month === '2026-08');

console.log('=== AGREGAÇÃO ===');
for (const g of m.aggregate(jul, c => c.provider))
  console.log(`  ${g.key.padEnd(18)} US$ ${g.total.toFixed(2).padStart(10)}  ${g.share}%  (${g.count} linhas)`);

console.log('\n=== TOP CATEGORIAS (FOCUS ServiceCategory, comparável entre nuvens) ===');
for (const g of m.aggregate(jul, c => c.serviceCategory).slice(0, 5))
  console.log(`  ${g.key.padEnd(28)} US$ ${g.total.toFixed(2).padStart(10)}  ${g.share}%`);

console.log('\n=== PROJEÇÃO ===');
const acum = m.sumBy(ago), dias = db.meta.currentMonthElapsedDays, totalDias = db.meta.currentMonthTotalDays;
console.log(`  acumulado ${acum.toFixed(2)} em ${dias} dias`);
console.log(`  média diária .......... ${m.dailyAverage(acum, dias)}`);
console.log(`  projeção .............. ${m.forecastMonth(acum, dias, totalDias)}  (db.json: ${db.meta.totals.currentMonthForecast})`);
console.log(`  variação vs julho ..... ${m.variationPct(m.forecastMonth(acum,dias,totalDias), m.sumBy(jul))}%`);

console.log('\n=== DETECÇÃO DE ANOMALIAS (recalculada do zero) ===');
const det = m.detectAnomalies(db.dailyCharges);
for (const x of det)
  console.log(`  ${x.severity.padEnd(8)} ${x.provider.split(' ')[0].padEnd(10)} ${x.serviceName.padEnd(20)} ${x.date}  ${x.deviationPct > 0 ? '+' : ''}${x.deviationPct}%  impacto ${x.monthlyImpact}`);
console.log(`  ETL detectou ${db.anomalies.length}, front-end recalculou ${det.length}`);
const iguais = det.every(d => db.anomalies.some(e => e.provider === d.provider && e.serviceName === d.serviceName && e.severity === d.severity));
console.log(`  severidades conferem com o ETL: ${iguais ? 'SIM' : 'NÃO'}`);

console.log('\n=== GOVERNANÇA ===');
const ov = a.overallCompliance(db.resources);
console.log(`  conformidade geral .... ${ov.compliant}/${ov.total} = ${ov.pct}%`);
for (const c of a.complianceByKey(db.resources))
  console.log(`  ${c.key.padEnd(13)} ${String(c.compliancePct).padStart(5)}%  custo sem a tag US$ ${c.untaggedCost.toFixed(2)}`);
const un = a.unallocatedCost(db.resources);
console.log(`  sem responsável ....... US$ ${un.cost.toFixed(2)} (${un.pct}% · ${un.resourceCount} recursos)`);

console.log('\n=== ALOCAÇÃO POR OwnerTeam ===');
for (const g of a.allocateByTag(db.resources))
  console.log(`  ${g.key.padEnd(16)} US$ ${g.total.toFixed(2).padStart(9)}  ${g.share}%${g.isUnassigned ? '  <= não atribuível' : ''}`);

console.log('\n=== FINOPS SCORE ===');
const s = m.finopsScore({
  totalCost: m.sumBy(jul),
  allocatableCost: m.sumBy(jul) - un.cost,
  potentialSavings: db.meta.totals.potentialSavings,
  budgets: db.budgets,
  monthlySeries: db.monthlySeries,
  anomalies: db.anomalies,
});
console.log(`  SCORE: ${s.score}/100  —  nível ${s.level.label} (${s.level.description})`);
for (const p of s.pillars)
  console.log(`    ${p.label.padEnd(24)} ${String(p.value).padStart(6)}  peso ${p.weight}%  contribui ${p.contribution}`);

console.log('\n=== VALIDAÇÃO FOCUS ===');
console.log(' ', JSON.stringify(f.validateDataset([{BilledCost:1,BillingCurrency:'USD',ChargePeriodStart:'2026-07-01',ChargePeriodEnd:'2026-07-01',ChargeCategory:'Usage',ServiceProviderName:'AWS',ServiceName:'EC2',ServiceCategory:'Compute',SubAccountId:'1'}])));
console.log(' ', JSON.stringify(f.validateDataset([{BilledCost:1}])));
console.log('  missingRequiredTags({Environment:"prod"}) =>', f.missingRequiredTags({Environment:'prod'}));
