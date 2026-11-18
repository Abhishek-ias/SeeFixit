INSERT INTO departments (name)
SELECT 'Street Lighting Department'
WHERE NOT EXISTS (
    SELECT 1
    FROM departments
    WHERE name = 'Street Lighting Department'
);