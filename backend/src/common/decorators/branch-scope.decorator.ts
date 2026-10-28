import { SetMetadata } from "@nestjs/common";

export const BRANCH_SCOPE_KEY = "branchScope";

/**
 * Declares which request fields identify the branch(es) an endpoint operates
 * on. Fields use a `<source>.<property>` notation where source is one of
 * `params`, `body` or `query`.
 *
 * When omitted, `BranchScopeGuard` checks `params.branchId`, `body.branchId`
 * and `query.branchId`.
 */
export const BranchScope = (...fields: string[]) =>
  SetMetadata(BRANCH_SCOPE_KEY, fields);
