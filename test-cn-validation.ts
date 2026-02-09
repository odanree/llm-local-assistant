/**
 * Test: Verify cn.ts infrastructure validation works correctly
 * This test ensures the "golden shield" (infrastructure domain protection) works
 */

import { SemanticValidator } from './src/semanticValidator';
import { DomainAwareAuditor } from './src/services/DomainAwareAuditor';
import { getApplicableProfiles } from './src/services/ValidatorProfiles';

const cnUtilityCode = `import { twMerge } from 'tailwind-merge';
import clsx from 'clsx';

export const cn = (...inputs: unknown[]) => {
  return twMerge(clsx(inputs));
};`;

const cnUtilityCodeFixed = `import { twMerge } from 'tailwind-merge';
import { clsx } from 'clsx';

export const cn = (...inputs: unknown[]) => {
  return twMerge(clsx(inputs));
};`;

console.log('='.repeat(60));
console.log('TEST: CN UTILITY INFRASTRUCTURE VALIDATION');
console.log('='.repeat(60));

// Test 1: Check domain detection
console.log('\n✅ TEST 1: Domain Detection');
const domain = DomainAwareAuditor.findDomain(cnUtilityCodeFixed);
if (domain) {
  console.log(`   ✓ Domain detected: ${domain.id} (${domain.description})`);
  console.log(`   ✓ Suppressed rules: ${domain.suppress.join(', ')}`);
} else {
  console.log('   ❌ No domain detected (expected infra_integrity)');
}

// Test 2: Check applicable profiles
console.log('\n✅ TEST 2: Validator Profiles');
const profiles = getApplicableProfiles(cnUtilityCodeFixed);
console.log(`   ✓ Applicable profiles: ${profiles.map(p => p.id).join(', ')}`);
profiles.forEach(p => {
  if (p.suppressLinterIds) {
    console.log(`   ✓ ${p.id} suppresses: ${p.suppressLinterIds.join(', ')}`);
  }
});

// Test 3: Validate code with SemanticValidator
console.log('\n✅ TEST 3: Semantic Validation');
const validator = new SemanticValidator();
const errors = validator.validateCode(cnUtilityCodeFixed);

if (errors.length === 0) {
  console.log('   ✓ NO ERRORS - Validation passed!');
  console.log('   ✓ Golden shield is working correctly');
} else {
  console.log(`   ⚠️  Found ${errors.length} error(s):`);
  errors.forEach((e, i) => {
    console.log(`      ${i + 1}. [${e.type}] ${e.message}`);
  });
}

// Test 4: Check semantic matching
console.log('\n✅ TEST 4: Semantic Rule Matching');
const testRules = [
  'unused-type-classvalue',
  'zod-suggestion',
  'no-any',
  'found-any-type',
];

const testErrorMsg = "Unused import: 'type ClassValue' is imported but never used.";
console.log(`   Test message: "${testErrorMsg}"`);
testRules.forEach(rule => {
  const isMatch = testErrorMsg.toLowerCase().includes(rule.split(/[-_]/).join(''));
  const status = isMatch ? '✓' : '✗';
  console.log(`   ${status} Rule "${rule}" matches: ${isMatch}`);
});

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));
