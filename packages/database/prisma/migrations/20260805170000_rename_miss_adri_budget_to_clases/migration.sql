UPDATE "Budget"
SET "name" = 'Clases', "updatedAt" = CURRENT_TIMESTAMP
WHERE "workspaceId" = '00000000-0000-4000-8000-000000000007'::UUID
  AND "name" = 'Miss Adri';

INSERT INTO "BudgetMatchingRule" (
  "id", "budgetId", "ruleType", "value", "normalizedValue", "priority", "active", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), "id", 'KEYWORD'::"BudgetRuleType", rule_value, rule_value, 400, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Budget"
CROSS JOIN (VALUES ('MISS'), ('MAESTRO'), ('MAESTRA'), ('CLASE'), ('CLASES')) AS rules(rule_value)
WHERE "workspaceId" = '00000000-0000-4000-8000-000000000007'::UUID
  AND "name" = 'Clases'
ON CONFLICT ("budgetId", "ruleType", "normalizedValue")
DO UPDATE SET "value" = EXCLUDED."value", "priority" = 400, "active" = true, "updatedAt" = CURRENT_TIMESTAMP;
