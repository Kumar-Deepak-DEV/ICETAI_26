/**
 * Rule engine — pure, deterministic, no LLM involvement.
 *
 * This module is the "safety net" the paper is about: whatever the LLM
 * layers around it do, THIS is the only code that decides eligibility.
 * Every leaf evaluation returns which field/value caused a pass or fail,
 * so a verdict can always be traced back to a specific rule clause.
 */

const OPS = {
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
  "<": (a, b) => a != null && a < b,
  "<=": (a, b) => a != null && a <= b,
  ">": (a, b) => a != null && a > b,
  ">=": (a, b) => a != null && a >= b,
  in: (a, b) => Array.isArray(b) && b.includes(a),
  not_in: (a, b) => Array.isArray(b) && !b.includes(a),
};

/**
 * @param {object} profile - flat object of citizen attributes, e.g. { age, annual_income, ... }
 * @param {object} node - a rule tree node, either:
 *   - a leaf: { id, field, op, value, description }
 *   - a composite: { id, logic: "AND"|"OR"|"NOT", clauses: [node, ...] }
 * @returns {{ id: string|null, passed: boolean, field?: string, description?: string, sub_results?: object[] }}
 */
function evaluateNode(profile, node) {
  if (!node) {
    throw new Error("evaluateNode called with an empty node");
  }

  // Leaf node: a single field comparison
  if (node.field) {
    const comparator = OPS[node.op];
    if (!comparator) {
      throw new Error(`Unknown comparison operator: ${node.op}`);
    }
    const actual = profile[node.field];
    const passed = actual === undefined || actual === null ? false : comparator(actual, node.value);
    return {
      id: node.id || null,
      field: node.field,
      op: node.op,
      expected: node.value,
      actual: actual ?? null,
      passed,
      description: node.description || `${node.field} ${node.op} ${JSON.stringify(node.value)}`,
    };
  }

  // Composite node
  if (!node.logic || !Array.isArray(node.clauses)) {
    throw new Error("Composite rule node must have 'logic' and 'clauses'");
  }

  const subResults = node.clauses.map((child) => evaluateNode(profile, child));

  let passed;
  if (node.logic === "AND") {
    passed = subResults.every((r) => r.passed);
  } else if (node.logic === "OR") {
    passed = subResults.some((r) => r.passed);
  } else if (node.logic === "NOT") {
    if (subResults.length !== 1) {
      throw new Error("NOT node must have exactly one clause");
    }
    passed = !subResults[0].passed;
  } else {
    throw new Error(`Unknown logic operator: ${node.logic}`);
  }

  return {
    id: node.id || null,
    logic: node.logic,
    passed,
    sub_results: subResults,
    description: node.description || null,
  };
}

/**
 * Flatten a nested evaluation result into a flat list of leaf clause results.
 *
 * `negate` tracks whether we're currently inside an odd number of NOT
 * ancestors. A leaf's raw `passed` value (whether it matched its own
 * comparison) is not the same as its EFFECTIVE contribution to the
 * verdict once NOT ancestors are accounted for — e.g. a leaf checking
 * "is an institutional landholder" that matches (raw passed=true) should
 * be reported as a FAILED clause when it sits under a NOT that requires
 * the opposite. Without this, failed_clauses/passed_clauses would
 * mislabel any clause nested inside a NOT.
 */
function flattenLeaves(result, negate = false, acc = []) {
  const isNot = result.logic === "NOT";
  const childNegate = isNot ? !negate : negate;

  if (result.sub_results) {
    if (result.logic === "OR") {
      const orEffectivePassed = negate ? !result.passed : result.passed;
      if (orEffectivePassed) {
        // The OR requirement was satisfied. Only surface the branch(es)
        // that actually satisfied it — a sibling branch that didn't match
        // is irrelevant to why the citizen passed, and listing it as a
        // "failed clause" would misleadingly suggest it mattered to the
        // outcome when an alternate path already succeeded.
        for (const child of result.sub_results) {
          const childEffective = childNegate ? !child.passed : child.passed;
          if (childEffective) flattenLeaves(child, childNegate, acc);
        }
      } else {
        // Every branch failed, so all of them are relevant to explaining why.
        for (const child of result.sub_results) {
          flattenLeaves(child, childNegate, acc);
        }
      }
    } else {
      for (const child of result.sub_results) {
        flattenLeaves(child, childNegate, acc);
      }
    }
  } else {
    acc.push({
      id: result.id,
      field: result.field,
      passed: negate ? !result.passed : result.passed,
      description: result.description,
      actual: result.actual,
      expected: result.expected,
    });
  }
  return acc;
}

/**
 * @param {object} profile - citizen profile
 * @param {object} schemeRule - full rule document: { scheme_id, name, logic, clauses } or { scheme_id, name, ...leaf }
 * @returns {{ scheme_id: string, eligible: boolean, passed_clauses: object[], failed_clauses: object[] }}
 */
function getVerdict(profile, schemeRule) {
  const rootNode = schemeRule.field
    ? schemeRule
    : { id: schemeRule.scheme_id, logic: schemeRule.logic, clauses: schemeRule.clauses };

  const result = evaluateNode(profile, rootNode);
  const leaves = flattenLeaves(result);

  return {
    scheme_id: schemeRule.scheme_id,
    eligible: result.passed,
    passed_clauses: leaves.filter((l) => l.passed),
    failed_clauses: leaves.filter((l) => !l.passed),
  };
}

/**
 * Given a rule tree, list the fields it references — used to figure out
 * which attributes are REQUIRED before a verdict can be computed, so the
 * hybrid pipeline knows when to ask a clarifying question instead of guessing.
 */
function getRequiredFields(node, acc = new Set()) {
  if (node.field) {
    acc.add(node.field);
  } else if (Array.isArray(node.clauses)) {
    for (const child of node.clauses) {
      getRequiredFields(child, acc);
    }
  }
  return acc;
}

module.exports = { evaluateNode, getVerdict, getRequiredFields, OPS };
