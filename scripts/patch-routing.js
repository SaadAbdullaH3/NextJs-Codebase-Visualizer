const fs = require('fs');
let code = fs.readFileSync('lib/graphLayoutPro.ts', 'utf8');

const oldRoutingBlock = `
    const sourceParent = edge.source.startsWith("cluster-") ? edge.source : nodeParentMap.get(edge.source);
    const targetParent = edge.target.startsWith("cluster-") ? edge.target : nodeParentMap.get(edge.target);

    // River Bundling Logic: Route cross-folder lines through boundary ports
    if (isClusterMode && sourceParent && targetParent && sourceParent !== targetParent) {
      const outPort = \`\${sourceParent}.port-right-out\`;
      const inPort = \`\${targetParent}.port-left-in\`;
      const trunkId = \`trunk-\${sourceParent}-->\${targetParent}\`;

      // A. Source Stream: route from inner file node to parent output port if expanded
      if (!edge.source.startsWith("cluster-")) {
        const srcFolder = elkNodesMap.get(sourceParent);
        if (srcFolder) {
          srcFolder.edges.push({ id: \`\${edge.id}-stream-out\`, sources: [edge.source + ((edge as any).sourceHandle ? \`.\${(edge as any).sourceHandle}\` : "")], targets: [outPort] });
        }
      }

      // B. Shared Highway: route between parent ports on the global canvas
      if (!activeTrunks.has(trunkId)) {
        activeTrunks.add(trunkId);
        rootElkEdges.push({ id: trunkId, sources: [outPort], targets: [inPort] });
      }

      // C. Target Stream: route from parent input port to target inner file node if expanded
      if (!edge.target.startsWith("cluster-")) {
        const destFolder = elkNodesMap.get(targetParent);
        if (destFolder) {
          destFolder.edges.push({ id: \`\${edge.id}-stream-in\`, sources: [inPort], targets: [edge.target + ((edge as any).targetHandle ? \`.\${(edge as any).targetHandle}\` : "")] });
        }
      }
      continue;
    }

    // Baseline routing for flat mode and internal folder lines
        const elkEdge: any = {
      id:      edge.id,
      sources: [
        edge.source +
        ((edge as any).sourceHandle ? \`.\${(edge as any).sourceHandle}\` : "")
      ],
      targets: [
        edge.target +
        ((edge as any).targetHandle ? \`.\${(edge as any).targetHandle}\` : "")
      ],
    };

    if (sourceParent && sourceParent === targetParent) {
      const parentElkNode = elkNodesMap.get(sourceParent);
      if (parentElkNode) {
        parentElkNode.edges.push(elkEdge);
        continue;
      }
    }
`;

const newRoutingBlock = `
    const getRootCluster = (id: string) => {
      let parent = nodeParentMap.get(id);
      while (parent && !parent.startsWith("cluster-")) {
        parent = nodeParentMap.get(parent);
      }
      return parent || (id.startsWith("cluster-") ? id : undefined);
    };

    const getLCA = (src: string, tgt: string) => {
      const srcAncestors = new Set<string>();
      let curr = nodeParentMap.get(src);
      while (curr) { srcAncestors.add(curr); curr = nodeParentMap.get(curr); }
      curr = nodeParentMap.get(tgt);
      while (curr) { if (srcAncestors.has(curr)) return curr; curr = nodeParentMap.get(curr); }
      return undefined;
    };

    const sourceRoot = getRootCluster(edge.source);
    const targetRoot = getRootCluster(edge.target);

    // River Bundling Logic: Route cross-folder lines through boundary ports
    if (isClusterMode && sourceRoot && targetRoot && sourceRoot !== targetRoot) {
      const outPort = \`\${sourceRoot}.port-right-out\`;
      const inPort = \`\${targetRoot}.port-left-in\`;
      const trunkId = \`trunk-\${sourceRoot}-->\${targetRoot}\`;

      // A. Source Stream: route from inner file node to parent output port if expanded
      if (!edge.source.startsWith("cluster-")) {
        const srcFolder = elkNodesMap.get(sourceRoot);
        if (srcFolder) {
          srcFolder.edges.push({ id: \`\${edge.id}-stream-out\`, sources: [edge.source + ((edge as any).sourceHandle ? \`.\${(edge as any).sourceHandle}\` : "")], targets: [outPort] });
        }
      }

      // B. Shared Highway: route between parent ports on the global canvas
      if (!activeTrunks.has(trunkId)) {
        activeTrunks.add(trunkId);
        rootElkEdges.push({ id: trunkId, sources: [outPort], targets: [inPort] });
      }

      // C. Target Stream: route from parent input port to target inner file node if expanded
      if (!edge.target.startsWith("cluster-")) {
        const destFolder = elkNodesMap.get(targetRoot);
        if (destFolder) {
          destFolder.edges.push({ id: \`\${edge.id}-stream-in\`, sources: [inPort], targets: [edge.target + ((edge as any).targetHandle ? \`.\${(edge as any).targetHandle}\` : "")] });
        }
      }
      continue;
    }

    // Baseline routing for flat mode and internal folder lines
    const elkEdge: any = {
      id:      edge.id,
      sources: [
        edge.source +
        ((edge as any).sourceHandle ? \`.\${(edge as any).sourceHandle}\` : "")
      ],
      targets: [
        edge.target +
        ((edge as any).targetHandle ? \`.\${(edge as any).targetHandle}\` : "")
      ],
    };

    const lca = getLCA(edge.source, edge.target);
    if (lca) {
      const parentElkNode = elkNodesMap.get(lca);
      if (parentElkNode) {
        parentElkNode.edges.push(elkEdge);
        continue;
      }
    }
`;

if (!code.includes(oldRoutingBlock.trim().split('\\n')[0])) {
  console.log("Could not find the exact old block");
} else {
  code = code.replace(oldRoutingBlock.trim(), newRoutingBlock.trim());
  fs.writeFileSync('lib/graphLayoutPro.ts', code);
  console.log("Successfully patched graphLayoutPro.ts");
}
