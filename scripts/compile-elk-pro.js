const fs = require('fs');
let code = fs.readFileSync('lib/graphLayout.ts', 'utf8');

// Rename function
code = code.replace('export async function layoutGraphWithElk(', 'export async function layoutGraphWithElkPro(');

// Update cluster detection
code = code.replace(
  'const isClusterMode = nodes.some(n => n.type === "clusterNode" || n.type === "group");',
  'const isClusterMode = nodes.some(n => n.type === "clusterNode" || n.type === "group" || n.type === "clusterNodePro");'
);

const portReplacement = `
    const approxW = isExpanded ? 300 : (Number(node.style?.width) || 240);
    const approxH = isExpanded ? 250 : (Number(node.style?.height) || 85);

    if (isGroup) {
      elkNode.ports = [
        { id: \`\${node.id}.port-right-out\`, x: approxW,     y: approxH * 0.5 },
        { id: \`\${node.id}.port-left-in\`,   x: 0,           y: approxH * 0.5 },
        { id: \`\${node.id}.port-top-in\`,    x: approxW / 2, y: 0 },
        { id: \`\${node.id}.port-bottom-out\`,x: approxW / 2, y: approxH },
      ];
      elkNode.layoutOptions = {
        ...elkNode.layoutOptions,
        "org.eclipse.elk.portConstraints": "FIXED_POS",
      };
    }
`;

// Remove old ports object property entirely
code = code.replace(/ports: \(isGroup && isClusterMode\) \? \[\s*\{ id: `\$\{node\.id\}-port-north`[^\]]+\] : undefined,/g, '/* ports added below */');

// Add new ports configuration after node initialization
code = code.replace('    elkNodesMap.set(node.id, elkNode);', portReplacement + '\n    elkNodesMap.set(node.id, elkNode);');

// Change port targets for cross-cluster tracking
code = code.replace(/const outPort = `\$\{sourceParent\}-port-south`;/g, 'const outPort = `${sourceParent}.port-right-out`;');
code = code.replace(/const inPort = `\$\{targetParent\}-port-north`;/g, 'const inPort = `${targetParent}.port-left-in`;');

fs.writeFileSync('lib/graphLayoutPro.ts', code);
