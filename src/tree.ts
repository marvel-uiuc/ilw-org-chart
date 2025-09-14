import { Org } from "./Org";

export interface ConnectedOrg extends Org {
    id: number;
    parent?: ConnectedOrg;
    level?: number;
    children?: ConnectedOrg[];
}

export type OrgPlacement = {
    width: number;
    height: number;
    top: number;
    left?: number;
};

export class TreeLevel {
    level: number;
    orgs: ConnectedOrg[];
    orientation?: "horizontal" | "vertical";
    constructor(level: number, orgs: ConnectedOrg[]) {
        this.level = level;
        this.orgs = orgs;
    }
}

export class TreeLevelMap extends Map<number, TreeLevel> {
    root: ConnectedOrg | null = null;

    orderedEntries() {
        return Array.from(this.entries()).sort((a, b) => a[0] - b[0]);
    }
}

let orgIdCount = 1;

export function treeLevelOrgs(org: Org): TreeLevelMap {
    const levelOrgs = new TreeLevelMap();

    function traverse(
        node: Org,
        parent: ConnectedOrg | null,
        currentLevel: number,
    ): ConnectedOrg {
        const level = currentLevel + (node.weight ?? 0);
        const connectedNode: ConnectedOrg = {
            ...node,
            id: orgIdCount++,
            parent: parent as ConnectedOrg,
            level,
        } as ConnectedOrg;

        if (!levelOrgs.has(level)) {
            levelOrgs.set(level, new TreeLevel(level, []));
        }
        levelOrgs.get(level)!.orgs.push(connectedNode);
        // Replace children with ConnectedOrgs
        if (node.children) {
            const connectedChildren: ConnectedOrg[] = [];
            for (const child of node.children) {
                const connectedChild = traverse(
                    child,
                    connectedNode,
                    level + 1,
                );
                connectedChildren.push(connectedChild);
            }
            connectedNode.children = connectedChildren;
        }
        return connectedNode;
    }

    levelOrgs.root = traverse(org, null, 0);

    // Top level can have at most three orgs: root and two children
    if (levelOrgs.get(0) && levelOrgs.get(0)!.orgs.length > 3) {
        let treeLevel = levelOrgs.get(0)!;

        const keep = treeLevel.orgs.slice(0, 3);
        const demotedOrgs = treeLevel.orgs.slice(3);
        treeLevel.orgs = keep;

        // Demote extra children to next level
        if (!levelOrgs.has(1)) {
            levelOrgs.set(1, new TreeLevel(1, []));
        }
        const nextLevel = levelOrgs.get(1)!;
        for (const demoted of demotedOrgs) {
            demoted.level = 1;
            nextLevel.orgs.push(demoted);
        }
    }

    return levelOrgs;
}

export function calculateLevelOrientations(
    levels: TreeLevelMap,
    minColWidth: number,
    maxTreeWidth: number,
) {
    // First pass: assign initial orientations
    for (const [level, treeLevel] of levels.entries()) {
        const requiredWidth = (treeLevel.orgs.length || 1) * minColWidth;
        if (minColWidth <= 0 || maxTreeWidth <= 0) {
            treeLevel.orientation = "vertical";
        } else if (requiredWidth <= maxTreeWidth) {
            treeLevel.orientation = "horizontal";
        } else {
            treeLevel.orientation = "vertical";
        }
    }

    // Second pass: propagate vertical orientation to descendant levels
    // Find all levels that are vertical and propagate
    const visited = new Set<number>();
    function propagateVertical(level: number) {
        if (visited.has(level)) return;
        visited.add(level);
        const treeLevel = levels.get(level);
        if (!treeLevel) return;
        for (const org of treeLevel.orgs) {
            if (org.children && org.children.length > 0) {
                // Find all children and set their levels to vertical
                for (const child of org.children) {
                    if (child.level !== undefined) {
                        treeLevel.orientation = "vertical";
                        propagateVertical(child.level);
                    }
                }
            }
        }
    }
    for (const [level, treeLevel] of levels.entries()) {
        if (treeLevel.orientation === "vertical") {
            propagateVertical(level);
        }
    }
}

/**
 * Measure the rendered sizes and vertical positions of org boxes in the tree.
 * @param levelsMap TreeLevelOrgsMap - orgs grouped by level
 * @param cssClass string - CSS class to apply for measurement
 * @param availableSpace number - available width in px
 * @param minColWidth number - minimum column width in px
 * @param orientations LevelOrientationsMap - orientation for each level
 */
export function measureOrgBoxes(
    levelsMap: TreeLevelMap,
    cssClass: string,
    availableSpace: number,
    minColWidth: number,
    maxColWidth: number,
) {
    console.log("[measureOrgBoxes] Start measuring org boxes", levelsMap);
    const startTime = performance.now();

    // Create hidden container
    const container = document.createElement("div");
    const hiddenTopOffset = -9999;
    container.style.position = "absolute";
    container.style.visibility = "hidden";
    container.style.pointerEvents = "none";
    container.style.left = "-9999px";
    container.style.top = hiddenTopOffset + "px";
    document.body.appendChild(container);

    const orgSizes = new Map<number, OrgPlacement>();
    const levelHeights = new Map();

    // Helper to recursively render vertical sub-tree
    function renderVerticalSubtree(
        org: ConnectedOrg,
        parent: HTMLDivElement,
        offset = 0,
    ): HTMLElement {
        const orgContainer = document.createElement("div");
        orgContainer.className = cssClass + " " + cssClass + "-vertical-org";
        orgContainer.style.marginLeft = offset + "px";
        orgContainer.style.boxSizing = "border-box";
        orgContainer.style.width = "calc(100% - " + offset + "px)";
        // Title
        const titleDiv = document.createElement("div");
        titleDiv.className = cssClass + "-title";
        titleDiv.textContent = org.title;
        orgContainer.appendChild(titleDiv);
        // Subtitle
        if (org.subtitle) {
            const subtitleDiv = document.createElement("div");
            subtitleDiv.className = cssClass + "-subtitle";
            subtitleDiv.textContent = org.subtitle || "";
            orgContainer.appendChild(subtitleDiv);
        }
        parent.appendChild(orgContainer);
        // Children
        if (org.children && org.children.length > 0) {
            for (const child of org.children) {
                const childContainer = renderVerticalSubtree(
                    child as ConnectedOrg,
                    parent,
                    offset + 20,
                );
            }
        }

        const rect = orgContainer.getBoundingClientRect();

        orgSizes.set(org.id, {
            width: rect.width,
            height: rect.height,
            top: rect.top - hiddenTopOffset,
        });

        return orgContainer;
    }

    let maxLevel = Math.max(...Array.from(levelsMap.keys()));
    let firstVerticalLevel: number | null = null;

    for (let level = 0; level <= maxLevel; level++) {
        const treeLevel = levelsMap.get(level);
        if (!treeLevel) continue;

        if (treeLevel.orientation === "horizontal") {
            firstVerticalLevel = null;
            const levelContainer = document.createElement("div");
            levelContainer.className =
                cssClass + "-level " + cssClass + "-horizontal";

            const columnWidth = Math.min(
                availableSpace / treeLevel.orgs.length,
                maxColWidth,
            );

            const largeOrgs = treeLevel.orgs.filter((org) => org.large);
            const smallOrgs = treeLevel.orgs.filter((org) => !org.large);

            // Divide the space so that large orgs get a bit more space
            const totalUnits = largeOrgs.length * 1.5 + smallOrgs.length * 1.0;
            const unitWidth = availableSpace / totalUnits;
            const largeOrgWidth = Math.min(
                Math.max(unitWidth * 1.5, minColWidth),
                maxColWidth,
            );
            const smallOrgWidth = Math.min(
                Math.max(unitWidth * 1.0, minColWidth),
                maxColWidth,
            );

            levelContainer.style.width = availableSpace + "px";
            container.appendChild(levelContainer);

            for (const org of treeLevel.orgs) {
                const el = document.createElement("div");
                el.className = cssClass;
                if (org.large) {
                    el.className += " " + cssClass + "-large";
                }
                el.style.width = org.large
                    ? largeOrgWidth + "px"
                    : smallOrgWidth + "px";

                const titleDiv = document.createElement("div");
                titleDiv.className = cssClass + "-title";
                titleDiv.textContent = org.title;
                el.appendChild(titleDiv);
                if (org.subtitle) {
                    const subtitleDiv = document.createElement("div");
                    subtitleDiv.className = cssClass + "-subtitle";
                    subtitleDiv.textContent = org.subtitle || "";
                    el.appendChild(subtitleDiv);
                }
                levelContainer.appendChild(el);
                const rect = el.getBoundingClientRect();
                orgSizes.set(org.id, {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top - hiddenTopOffset,
                });
            }
            const height = levelContainer.getBoundingClientRect().height;
            levelHeights.set(level, height);
        } else if (
            firstVerticalLevel === null &&
            treeLevel.orientation === "vertical"
        ) {
            firstVerticalLevel = level;
            // Find all the unique parents of this level's orgs
            const verticalContainer = document.createElement("div");
            verticalContainer.className =
                cssClass + "-level " + cssClass + "-vertical";
            verticalContainer.style.width = availableSpace + "px";
            container.appendChild(verticalContainer);
            const uniqueParents = new Set<ConnectedOrg>();
            for (const org of treeLevel.orgs) {
                if (org.parent) {
                    uniqueParents.add(org.parent);
                }
            }
            let verticalHeights: number[] = [];
            for (const org of uniqueParents) {
                const subtreeContainer = document.createElement("div");
                subtreeContainer.className = cssClass + "-vertical-subtree";
                const width = orgSizes.get(org.id)!.width;
                subtreeContainer.style.width = width - 20 + "px";
                verticalContainer.appendChild(subtreeContainer);
                for (const child of org.children || []) {
                    if (child.level && child.level >= level) {
                        renderVerticalSubtree(child, subtreeContainer, 10);
                    }
                }
                const height = subtreeContainer.getBoundingClientRect().height;
                verticalHeights.push(height);
            }
            levelHeights.set(level, Math.max(...verticalHeights));
        } else {
            // skip levels that are descendants of the first vertical level
            levelHeights.set(level, 0);
        }
    }

    calculateHorizontalPositions(levelsMap, orgSizes, availableSpace);
    // document.body.removeChild(container);
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(
        `[measureOrgBoxes] Finished measuring. Duration: ${duration.toFixed(2)} ms`,
        orgSizes,
    );


    return orgSizes;
}

export function calculateHorizontalPositions(
    levelsMap: TreeLevelMap,
    placements: Map<number, OrgPlacement>,
    availableSpace: number,
) {
    // Helper to center an org horizontally
    function centerOrg(orgId: number, containerWidth: number) {
        const placement = placements.get(orgId);
        if (!placement) return 0;
        return Math.max(0, (containerWidth - placement.width) / 2);
    }

    // Center root org and arrange top-level orgs (root + children) around it
    if (!levelsMap.root) return;
    // (rootPlacement will be declared below for rootOrg)

    // Find top level (level 0 or root.level)
    const rootLevel = levelsMap.root.level ?? 0;
    const topLevel = levelsMap.get(rootLevel);
    if (!topLevel) return;

    // Identify top-level orgs: root and its children that are also at top level
    const spacing = 20;
    const topOrgs = topLevel.orgs;
    if (topOrgs.length === 0) return;

    // Place root at center
    const rootPlacementIdx = 0;
    const rootOrg = topOrgs[0];
    const rootPlacement = placements.get(rootOrg.id);
    if (!rootPlacement) return;
    let rootLeft = centerOrg(rootOrg.id, availableSpace);

    // Only up to 3 orgs at top level
    let lefts: number[] = [];
    lefts[0] = rootLeft;
    // Place second org to left
    if (topOrgs.length > 1) {
        const p = placements.get(topOrgs[1].id);
        if (p) {
            lefts[1] = rootLeft - (p.width + spacing);
        }
    }
    // Place third org to right
    if (topOrgs.length > 2) {
        const p = placements.get(topOrgs[2].id);
        if (p) {
            lefts[2] = rootLeft + rootPlacement.width + spacing;
        }
    }

    // If any org is out of bounds, shift all as needed
    let minLeft = Math.min(...lefts.filter(x => x !== undefined));
    let maxRight = Math.max(...topOrgs.map((org, i) => {
        const p = placements.get(org.id);
        return p && lefts[i] !== undefined ? lefts[i] + p.width : 0;
    }));
    let shift = 0;
    if (minLeft < 0) {
        shift = -minLeft;
    } else if (maxRight > availableSpace) {
        shift = availableSpace - maxRight;
    }
    // Apply shift
    for (let i = 0; i < topOrgs.length; i++) {
        const p = placements.get(topOrgs[i].id);
        if (p && lefts[i] !== undefined) {
            p.left = lefts[i] + shift;
        }
    }

    // For each level, position orgs
    let skipVerticalLevels = false;
    for (const [level, treeLevel] of levelsMap.orderedEntries()) {
        if (level === rootLevel) continue; // already handled
        if (skipVerticalLevels) {
            // Skip vertical levels until next horizontal
            if (treeLevel.orientation === "horizontal") {
                skipVerticalLevels = false;
            } else {
                continue;
            }
        }
        if (treeLevel.orientation === "horizontal") {
            // Group orgs by parent
            const parentGroups = new Map<number, ConnectedOrg[]>();
            for (const org of treeLevel.orgs) {
                if (org.parent) {
                    const pid = org.parent.id;
                    if (!parentGroups.has(pid)) parentGroups.set(pid, []);
                    parentGroups.get(pid)!.push(org);
                }
            }
            const groupBounds: { left: number; right: number, pid: number }[] = [];
            for (const [pid, group] of parentGroups.entries()) {
                // Place orgs in group horizontally in order
                let totalWidth = 0;
                for (const org of group) {
                    const p = placements.get(org.id);
                    if (p) totalWidth += p.width;
                }
                totalWidth += spacing * (group.length - 1);
                // Center group under parent
                const parentPlacement = placements.get(pid);
                let groupLeft = parentPlacement && parentPlacement.left !== undefined
                    ? parentPlacement.left + (parentPlacement.width - totalWidth) / 2
                    : centerOrg(group[0].id, availableSpace);
                // Clamp groupLeft if out of bounds
                if (groupLeft < 0) groupLeft = 0;
                if (groupLeft + totalWidth > availableSpace) groupLeft = availableSpace - totalWidth;
                // Place each org
                let offset = groupLeft;
                for (const org of group) {
                    const p = placements.get(org.id);
                    if (p) {
                        p.left = offset;
                        offset += p.width + spacing;
                    }
                }
                groupBounds.push({ pid, left: groupLeft, right: groupLeft + totalWidth });
            }
            // If any groups overlap, shift them apart equally, but also keeping within bounds
            groupBounds.sort((a, b) => a.left - b.left);
            for (let i = 1; i < groupBounds.length; i++) {
                const prev = groupBounds[i - 1];
                const curr = groupBounds[i];
                if (prev.right + spacing > curr.left) {
                    // Overlap detected, shift curr to the right
                    const overlap = prev.right + spacing - curr.left;
                    // Shift current group and all subsequent groups
                    for (let j = i; j < groupBounds.length; j++) {
                        const gb = groupBounds[j];
                        const p = placements.get(gb.pid);
                        if (p && p.left !== undefined) {
                            p.left += overlap;
                            gb.left += overlap;
                            gb.right += overlap;
                        }
                    }
                }
            }
            // After shifting, ensure all groups are within bounds
            let overallMinLeft = Math.min(...groupBounds.map(gb => gb.left));
            let overallMaxRight = Math.max(...groupBounds.map(gb => gb.right));
            let overallShift = 0;
            if (overallMinLeft < 0) {
                overallShift = -overallMinLeft;
            } else if (overallMaxRight > availableSpace) {
                overallShift = availableSpace - overallMaxRight;
            }
            if (overallShift !== 0) {
                for (const gb of groupBounds) {
                    const p = placements.get(gb.pid);
                    if (p && p.left !== undefined) {
                        p.left += overallShift;
                    }
                }
            }
        } else if (treeLevel.orientation === "vertical") {
            // First vertical level in a series
            if (!skipVerticalLevels) {
                // For each org, align subtree to parent's left + 20px
                for (const org of treeLevel.orgs) {
                    if (org.parent) {
                        const parentPlacement = placements.get(org.parent.id);
                        if (parentPlacement && parentPlacement.left !== undefined) {
                            const p = placements.get(org.id);
                            if (p) {
                                p.left = parentPlacement.left + 20;
                            }
                        }
                    }
                }
                // For all descendants, each level gets a further 20px
                // No need to track verticalStartLevel or verticalParentLeft
                // Mark to skip remaining vertical levels until next horizontal
                skipVerticalLevels = true;
            }
        }
    }
}
