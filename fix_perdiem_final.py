import re

# Read the file
with open('src/components/checks.tsx', 'r') as f:
    content = f.read()

# Find the specific section to replace
lines = content.split('\n')
new_lines = []

i = 0
while i < len(lines):
    line = lines[i]
    
    # Look for the fallback comment
    if '// Fallback to legacy calculation' in line and 'const total = parseFloat(calculatePerDiemTotal(inputs[emp.id] || {}));' in lines[i+1]:
        # Add the new logic
        new_lines.append('                              // For multiple clients tab, aggregate all relationship-specific per diem values')
        new_lines.append('                              if (selectedClientId === \'multiple\' && emp.clientPayTypeRelationships) {')
        new_lines.append('                                let total = 0;')
        new_lines.append('                                emp.clientPayTypeRelationships.forEach(relationship => {')
        new_lines.append('                                  if (relationship.payType === \'perdiem\') {')
        new_lines.append('                                    total += parseFloat(calculatePerDiemTotalForRelationship(inputs[emp.id] || {}, relationship.id));')
        new_lines.append('                                  }')
        new_lines.append('                                });')
        new_lines.append('                                return total > 0 ? (')
        new_lines.append('                                  <Box sx={{ display: \'flex\', justifyContent: \'space-between\' }}>')
        new_lines.append('                                    <span>Per Diem Amount:</span>')
        new_lines.append('                                    <span>${total.toFixed(2)}</span>')
        new_lines.append('                                  </Box>')
        new_lines.append('                                ) : null;')
        new_lines.append('                              }')
        new_lines.append('                              // Fallback to legacy calculation')
        new_lines.append('                              const total = parseFloat(calculatePerDiemTotal(inputs[emp.id] || {}));')
        i += 2  # Skip the original lines
    else:
        new_lines.append(line)
        i += 1

# Write the file back
with open('src/components/checks.tsx', 'w') as f:
    f.write('\n'.join(new_lines))

print("Per Diem calculation fixed for Multiple Clients tab!")
