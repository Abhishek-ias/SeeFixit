-- =====================================================
-- SeeFixit Department Seed Data
-- =====================================================

INSERT INTO departments (name)
SELECT seed.name
FROM (
    VALUES
        ('Road Department'),
        ('Sanitation Department'),
        ('Water Department')
) AS seed(name)
WHERE NOT EXISTS (
    SELECT 1
    FROM departments existing
    WHERE existing.name = seed.name
);
