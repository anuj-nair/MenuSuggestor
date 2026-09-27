export const REQUIRED_PROTEINS = ['chicken', 'tofu'];

export function checkProteinCoverage(pickedMeals) {
  const coverage = {};
  for (const protein of REQUIRED_PROTEINS) {
    coverage[protein] = pickedMeals.some((m) => m && m.proteinTags && m.proteinTags.has(protein));
  }
  return coverage;
}

export function missingProteins(pickedMeals) {
  const coverage = checkProteinCoverage(pickedMeals);
  return REQUIRED_PROTEINS.filter((p) => !coverage[p]);
}
