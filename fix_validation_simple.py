import re

# Read the file
with open('src/components/checks.tsx', 'r') as f:
    content = f.read()

# Find the specific validation section and replace it
old_pattern = r'        // Fallback to basic fields if no relationship data found\n        if \(!hasHourlyData && !hasPerDiemData\) \{\n          // Check basic per diem fields\n          hasPerDiemData = parseFloat\(calculatePerDiemTotal\(data\)\) > 0;\n          \n          // Also check basic hourly fields\n          hasHourlyData = parseFloat\(data\.hours \|\| \'0\'\) > 0 \|\| \n                         parseFloat\(data\.otHours \|\| \'0\'\) > 0 \|\| \n                         parseFloat\(data\.holidayHours \|\| \'0\'\) > 0;\n        }'

new_pattern = '''        // Fallback to basic fields if no relationship data found
        if (!hasHourlyData && !hasPerDiemData) {
          // For Multiple Clients tab, check relationship-specific fields
          if (selectedClientId === 'multiple' && emp.clientPayTypeRelationships) {
            emp.clientPayTypeRelationships.forEach(relationship => {
              if (relationship.payType === 'hourly') {
                const relHours = parseFloat(data[`${relationship.id}_hours`] || '0');
                const relOtHours = parseFloat(data[`${relationship.id}_otHours`] || '0');
                const relHolidayHours = parseFloat(data[`${relationship.id}_holidayHours`] || '0');
                if (relHours > 0 || relOtHours > 0 || relHolidayHours > 0) {
                  hasHourlyData = true;
                }
              } else if (relationship.payType === 'perdiem') {
                const relAmount = parseFloat(data[`${relationship.id}_perdiemAmount`] || '0');
                const relBreakdown = data[`${relationship.id}_perdiemBreakdown`];
                if (relBreakdown) {
                  const hasDailyData = ['perdiemMonday', 'perdiemTuesday', 'perdiemWednesday',
                                       'perdiemThursday', 'perdiemFriday', 'perdiemSaturday', 'perdiemSunday']
                    .some(day => parseFloat(data[`${relationship.id}_${day}`] || '0') > 0);
                  if (hasDailyData) {
                    hasPerDiemData = true;
                  }
                } else if (relAmount > 0) {
                  hasPerDiemData = true;
                }
              }
            });
          }
          
          // Check basic per diem fields if still no data found
          if (!hasPerDiemData) {
            hasPerDiemData = parseFloat(calculatePerDiemTotal(data)) > 0;
          }
          
          // Check basic hourly fields if still no data found
          if (!hasHourlyData) {
            hasHourlyData = parseFloat(data.hours || '0') > 0 || 
                           parseFloat(data.otHours || '0') > 0 || 
                           parseFloat(data.holidayHours || '0') > 0;
          }
        }'''

# Replace the pattern
new_content = re.sub(old_pattern, new_pattern, content, flags=re.DOTALL)

# Write the file back
with open('src/components/checks.tsx', 'w') as f:
    f.write(new_content)

print("Validation logic fixed for Multiple Clients tab!")
