import re

# Read the file
with open('src/components/checks.tsx', 'r') as f:
    content = f.read()

# Find where checkData is being prepared and add relationshipDetails
lines = content.split('\n')
new_lines = []

i = 0
while i < len(lines):
    line = lines[i]
    
    # Look for the checkData preparation section
    if 'console.log("🔍 DEBUG: Data after cleanup:", checkData);' in line:
        # Add relationshipDetails to checkData before saving
        new_lines.append('        // Add relationshipDetails to checkData for proper display')
        new_lines.append('        checkData.relationshipDetails = relationshipDetails;')
        new_lines.append('        checkData.selectedRelationshipIds = selectedRelationshipIds;')
        new_lines.append('')
        new_lines.append(line)
    else:
        new_lines.append(line)
    i += 1

# Write the file back
with open('src/components/checks.tsx', 'w') as f:
    f.write('\n'.join(new_lines))

print("Added relationshipDetails to checkData!")
