import re

# Read the file
with open('src/components/checks.tsx', 'r') as f:
    content = f.read()

# Find and replace the specific section
old_pattern = r'                              // Fallback to legacy calculation\n                              const total = parseFloat\(calculatePerDiemTotal\(inputs\[emp\.id\] \|\| \{\}\)\)\);'

new_pattern = '''                              // For multiple clients tab, aggregate all relationship-specific per diem values
                              if (selectedClientId === 'multiple' && emp.clientPayTypeRelationships) {
                                let total = 0;
                                emp.clientPayTypeRelationships.forEach(relationship => {
                                  if (relationship.payType === 'perdiem') {
                                    total += parseFloat(calculatePerDiemTotalForRelationship(inputs[emp.id] || {}, relationship.id));
                                  }
                                });
                                return total > 0 ? (
                                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>Per Diem Amount:</span>
                                    <span>${total.toFixed(2)}</span>
                                  </Box>
                                ) : null;
                              }
                              // Fallback to legacy calculation
                              const total = parseFloat(calculatePerDiemTotal(inputs[emp.id] || {}));'''

# Replace the pattern
new_content = re.sub(old_pattern, new_pattern, content)

# Write the file back
with open('src/components/checks.tsx', 'w') as f:
    f.write(new_content)

print("Replacement completed successfully!")
