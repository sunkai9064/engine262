import { Value } from '../value.mjs';
import { Q, X, ReturnIfAbrupt } from '../completion.mjs';
import {
  GetReferencedName,
  GetValue,
  PutValue,
  ToBoolean,
} from '../abstract-ops/all.mjs';
import {
  IsAnonymousFunctionDefinition,
  IsIdentifierRef,
} from '../static-semantics/all.mjs';
import { Evaluate } from '../evaluator.mjs';
import { OutOfRange } from '../helpers.mjs';
import {
  NamedEvaluation,
  ApplyStringOrNumericBinaryOperator,
  DestructuringAssignmentEvaluation,
} from './all.mjs';

// #sec-destructuring-assignment
export function refineLeftHandSideExpression(node) {
  switch (node.type) {
    case 'ArrayLiteral':
      return {
        type: 'ArrayAssignmentPattern',
        AssignmentElementList: node.ElementList.map((n) => refineLeftHandSideExpression(n)),
      };
    case 'ObjectLiteral': {
      const refined = {
        type: 'ObjectAssignmentPattern',
        AssignmentPropertyList: [],
      };
      node.PropertyDefinitionList.forEach((p) => {
        if (p.PropertyName === null && p.AssignmentExpression) {
          refined.AssignmentRestProperty = {
            type: 'AssignmentRestProperty',
            DestructuringAssignmentTarget: p.AssignmentExpression,
          };
        } else {
          refined.AssignmentPropertyList.push(refineLeftHandSideExpression(p));
        }
      });
      return refined;
    }
    case 'PropertyDefinition':
      return {
        type: 'AssignmentProperty',
        PropertyName: node.PropertyName,
        AssignmentElement: node.AssignmentExpression.type === 'AssignmentExpression'
          ? {
            type: 'AssignmentElement',
            DestructuringAssignmentTarget: node.AssignmentExpression.LeftHandSideExpression,
            AssignmentExpression: node.AssignmentExpression.AssignmentExpression,
          }
          : {
            type: 'AssignmentElement',
            DestructuringAssignmentTarget: node.AssignmentExpression,
            Initializer: undefined,
          },
      };
    case 'IdentifierReference':
      return {
        type: 'AssignmentProperty',
        IdentifierReference: node,
        Initializer: undefined,
      };
    case 'CoverInitializedName':
      return {
        type: 'AssignmentProperty',
        IdentifierReference: node.IdentifierReference,
        Initializer: node.Initializer,
      };
    case 'AssignmentExpression':
      return {
        type: 'AssignmentElement',
        DestructuringAssignmentTarget: node.LeftHandSideExpression,
        Initializer: node.AssignmentExpression,
      };
    default:
      throw new OutOfRange('refineLeftHandSideExpression', node.type);
  }
}

// #sec-assignment-operators-runtime-semantics-evaluation
//   AssignmentExpression :
//     LeftHandSideExpression `=` AssignmentExpression
//     LeftHandSideExpression AssignmentOperator AssignmentExpression
// https://tc39.es/proposal-logical-assignment/#sec-assignment-operators-runtime-semantics-evaluation
//     LeftHandSideExpression `&&=` AssignmentExpression
//     LeftHandSideExpression `||=` AssignmentExpression
//     LeftHandSideExpression `??=` AssignmentExpression
export function* Evaluate_AssignmentExpression({
  LeftHandSideExpression, AssignmentOperator, AssignmentExpression,
}) {
  if (AssignmentOperator === '=') {
    // 1. If LeftHandSideExpression is neither an ObjectLiteral nor an ArrayLiteral, then
    if (LeftHandSideExpression.type !== 'ObjectLiteral' && LeftHandSideExpression.type !== 'ArrayLiteral') {
      // a. Let lref be the result of evaluating LeftHandSideExpression.
      const lref = yield* Evaluate(LeftHandSideExpression);
      // b. ReturnIfAbrupt(lref).
      ReturnIfAbrupt(lref);
      // c. If IsAnonymousFunctionDefinition(AssignmentExpression) and IsIdentifierRef of LeftHandSideExpression are both true, then
      let rval;
      if (IsAnonymousFunctionDefinition(AssignmentExpression) && IsIdentifierRef(LeftHandSideExpression)) {
        // i. Let rval be NamedEvaluation of AssignmentExpression with argument GetReferencedName(lref).
        rval = yield* NamedEvaluation(AssignmentExpression, GetReferencedName(lref));
      } else { // d. Else,
        // i. Let rref be the result of evaluating AssignmentExpression.
        const rref = yield* Evaluate(AssignmentExpression);
        // ii. Let rval be ? GetValue(rref).
        rval = Q(GetValue(rref));
      }
      // e. Perform ? PutValue(lref, rval).
      Q(PutValue(lref, rval));
      // f. Return rval.
      return rval;
    }
    // 2. Let assignmentPattern be the AssignmentPattern that is covered by LeftHandSideExpression.
    const assignmentPattern = refineLeftHandSideExpression(LeftHandSideExpression);
    // 3. Let rref be the result of evaluating AssignmentExpression.
    const rref = yield* Evaluate(AssignmentExpression);
    // 3. Let rval be ? GetValue(rref).
    const rval = Q(GetValue(rref));
    // 4. Perform ? DestructuringAssignmentEvaluation of assignmentPattern using rval as the argument.
    Q(yield* DestructuringAssignmentEvaluation(assignmentPattern, rval));
    // 5. Return rval.
    return rval;
  } else if (AssignmentOperator === '&&=') {
    // 1. Let lref be the result of evaluating LeftHandSideExpression.
    const lref = yield* Evaluate(LeftHandSideExpression);
    // 2. Let lval be ? GetValue(lref).
    const lval = Q(GetValue(lref));
    // 3. Let lbool be ! ToBoolean(lval).
    const lbool = X(ToBoolean(lval));
    // 4. If lbool is false, return lval.
    if (lbool === Value.false) {
      return lval;
    }
    // 5. Let rref be the result of evaluating AssignmentExpression.
    const rref = yield* Evaluate(AssignmentExpression);
    // 6. Let rval be ? GetValue(rref).
    const rval = Q(GetValue(rref));
    // 7. Perform ? PutValue(lref, rval).
    Q(PutValue(lref, rval));
    // 8. Return rval.
    return rval;
  } else if (AssignmentOperator === '||=') {
    // 1. Let lref be the result of evaluating LeftHandSideExpression.
    const lref = yield* Evaluate(LeftHandSideExpression);
    // 2. Let lval be ? GetValue(lref).
    const lval = Q(GetValue(lref));
    // 3. Let lbool be ! ToBoolean(lval).
    const lbool = X(ToBoolean(lval));
    // 4. If lbool is true, return lval.
    if (lbool === Value.true) {
      return lval;
    }
    // 5. Let rref be the result of evaluating AssignmentExpression.
    const rref = yield* Evaluate(AssignmentExpression);
    // 6. Let rval be ? GetValue(rref).
    const rval = Q(GetValue(rref));
    // 7. Perform ? PutValue(lref, rval).
    Q(PutValue(lref, rval));
    // 8. Return rval.
    return rval;
  } else if (AssignmentOperator === '??=') {
    // 1.Let lref be the result of evaluating LeftHandSideExpression.
    const lref = yield* Evaluate(LeftHandSideExpression);
    // 2. Let lval be ? GetValue(lref).
    const lval = Q(GetValue(lref));
    // 3. If lval is not undefined nor null, return lval.
    if (lval !== Value.undefined && lval !== Value.null) {
      return lval;
    }
    // 4. Let rref be the result of evaluating AssignmentExpression.
    const rref = yield* Evaluate(AssignmentExpression);
    // 5. Let rval be ? GetValue(rref).
    const rval = Q(GetValue(rref));
    // 6. Perform ? PutValue(lref, rval).
    Q(PutValue(lref, rval));
    // 7. Return rval.
    return rval;
  } else {
    // 1. Let lref be the result of evaluating LeftHandSideExpression.
    const lref = yield* Evaluate(LeftHandSideExpression);
    // 2. Let lval be ? GetValue(lref).
    const lval = Q(GetValue(lref));
    // 3. Let rref be the result of evaluating AssignmentExpression.
    const rref = yield* Evaluate(AssignmentExpression);
    // 4. Let rval be ? GetValue(rref).
    const rval = Q(GetValue(rref));
    // 5. Let assignmentOpText be the source text matched by AssignmentOperator.
    const assignmentOpText = AssignmentOperator;
    // 6. Let opText be the sequence of Unicode code points associated with assignmentOpText in the following table:
    const opText = {
      '**=': '**',
      '*=': '*',
      '/=': '/',
      '%=': '%',
      '+=': '+',
      '-=': '-',
      '<<=': '<<',
      '>>=': '>>',
      '>>>=': '>>>',
      '&=': '&',
      '^=': '^',
      '|=': '|',
    }[assignmentOpText];
    // 7. Let r be ApplyStringOrNumericBinaryOperator(lval, opText, rval).
    const r = ApplyStringOrNumericBinaryOperator(lval, opText, rval);
    // 8. Perform ? PutValue(lref, r).
    Q(PutValue(lref, r));
    // 9. Return r.
    return r;
  }
}
