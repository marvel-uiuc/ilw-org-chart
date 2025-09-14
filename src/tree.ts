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

export type OrgLine = {
    points: { x: number; y: number }[];
};

export type OrgChartConfig = {
    horizontalSpacing: number;
    verticalSpacing: number;
    verticalSubtreeSpacing: number;
    verticalChildOffset: number;
    largeOrgSizeMultiplier: number;
    availableSpace: number;
    minColWidth: number;
    maxColWidth: number;
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
    config: OrgChartConfig,
) {
    // First pass: assign initial orientations
    for (const [level, treeLevel] of levels.entries()) {
        const requiredWidth = (treeLevel.orgs.length || 1) * config.minColWidth;
        if (config.minColWidth <= 0 || config.maxColWidth <= 0) {
            treeLevel.orientation = "vertical";
        } else if (requiredWidth <= config.availableSpace) {
            treeLevel.orientation = "horizontal";
        } else {
            treeLevel.orientation = "vertical";
        }
    }

    // Second pass: propagate vertical orientation to descendant levels
    const visited = new Set<number>();
    function propagateVertical(level: number) {
        if (visited.has(level)) return;
        visited.add(level);
        const treeLevel = levels.get(level);
        if (!treeLevel) return;
        for (const org of treeLevel.orgs) {
            if (org.children && org.children.length > 0) {
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
    config: OrgChartConfig,
) {
    console.log("[measureOrgBoxes] Start measuring org boxes", levelsMap);
    const startTime = performance.now();

    // Create hidden container
    const container = document.createElement("div");
    const hiddenTopOffset = -9999;
    container.style.position = "absolute";
    container.style.background = "#111";
    // container.style.visibility = "hidden";
    // container.style.pointerEvents = "none";
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
        if (org.large) {
            orgContainer.className += " " + cssClass + "-large";
        }
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
                renderVerticalSubtree(
                    child as ConnectedOrg,
                    parent,
                    offset + config.verticalChildOffset,
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
            levelContainer.style.columnGap = config.horizontalSpacing + "px";
            levelContainer.style.marginBottom = config.verticalSpacing + "px";

            const columnWidth = Math.min(
                config.availableSpace / treeLevel.orgs.length,
                config.maxColWidth,
            );

            const largeOrgs = treeLevel.orgs.filter((org) => org.large);
            const smallOrgs = treeLevel.orgs.filter((org) => !org.large);

            // Divide the space so that large orgs get a bit more space
            const totalUnits =
                largeOrgs.length * config.largeOrgSizeMultiplier +
                smallOrgs.length * 1.0;
            const unitWidth =
                (config.availableSpace -
                    (totalUnits - 1) * config.horizontalSpacing) /
                totalUnits;
            const largeOrgWidth = Math.min(
                Math.max(
                    unitWidth * config.largeOrgSizeMultiplier,
                    config.minColWidth,
                ),
                config.maxColWidth,
            );
            let smallOrgWidth = Math.min(
                Math.max(unitWidth * 1.0, config.minColWidth),
                config.maxColWidth,
            );

            levelContainer.style.width = config.availableSpace + "px";
            container.appendChild(levelContainer);

            const els = new Map<number, HTMLDivElement>();

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
                els.set(org.id, el);
            }

            let maxHeight = 0;
            for (const [id, el] of els) {
                const rect = el.getBoundingClientRect();
                orgSizes.set(id, {
                    width: rect.width,
                    height: rect.height,
                    top: rect.top - hiddenTopOffset,
                });
                maxHeight = Math.max(maxHeight, rect.height);
            }
            if (smallOrgs.length === 0 || largeOrgs.length === 0) {
                // If all orgs are of the same size, make them all the same height
                for (const org of treeLevel.orgs) {
                    const p = orgSizes.get(org.id);
                    if (p) {
                        const diff = maxHeight - p.height;
                        p.height = maxHeight;
                        p.top -= diff / 2; // center vertically
                    }
                }
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
            verticalContainer.style.width = config.availableSpace + "px";
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
                subtreeContainer.style.width =
                    width - config.verticalChildOffset + "px";
                subtreeContainer.style.gap =
                    config.verticalSubtreeSpacing + "px";
                verticalContainer.appendChild(subtreeContainer);
                for (const child of org.children || []) {
                    if (child.level && child.level >= level) {
                        renderVerticalSubtree(
                            child,
                            subtreeContainer,
                            config.verticalChildOffset,
                        );
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

    const updated = calculateHorizontalPositions(levelsMap, orgSizes, config);
    // document.body.removeChild(container);
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(
        `[measureOrgBoxes] Finished measuring. Duration: ${duration.toFixed(2)} ms`,
        orgSizes,
    );
    console.log("[measureOrgBoxes] Measured org sizes:", orgSizes);
    console.log("[measureOrgBoxes] Level heights:", levelHeights);
    console.log("[measureOrgBoxes] Updated placements:", updated);

    return orgSizes;
}

export function calculateHorizontalPositions(
    levelsMap: TreeLevelMap,
    placements: Map<number, OrgPlacement>,
    config: OrgChartConfig,
) {
    function centerOrg(orgId: number, containerWidth: number) {
        const placement = placements.get(orgId);
        if (!placement) return 0;
        return Math.max(0, (containerWidth - placement.width) / 2);
    }

    function applyVerticalLeft(orgs: ConnectedOrg[], left: number) {
        for (const org of orgs) {
            const placement = placements.get(org.id);
            if (placement) {
                placement.left = left;
            }
            if (org.children && org.children.length > 0) {
                applyVerticalLeft(
                    org.children,
                    left + config.verticalChildOffset,
                );
            }
        }
    }

    if (!levelsMap.root) return;
    const rootLevel = levelsMap.root.level ?? 0;
    const topLevel = levelsMap.get(rootLevel);
    if (!topLevel) return;

    const topOrgs = topLevel.orgs;
    if (topOrgs.length === 0) return;

    const rootPlacementIdx = 0;
    const rootOrg = topOrgs[0];
    const rootPlacement = placements.get(rootOrg.id);
    if (!rootPlacement) return;
    let rootLeft = centerOrg(rootOrg.id, config.availableSpace);

    let lefts: number[] = [];
    lefts[0] = rootLeft;
    if (topOrgs.length > 1) {
        const p = placements.get(topOrgs[1].id);
        if (p) {
            lefts[1] = rootLeft - (p.width + config.horizontalSpacing);
        }
    }
    if (topOrgs.length > 2) {
        const p = placements.get(topOrgs[2].id);
        if (p) {
            lefts[2] =
                rootLeft + rootPlacement.width + config.horizontalSpacing;
        }
    }

    let minLeft = Math.min(...lefts.filter((x) => x !== undefined));
    let maxRight = Math.max(
        ...topOrgs.map((org, i) => {
            const p = placements.get(org.id);
            return p && lefts[i] !== undefined ? lefts[i] + p.width : 0;
        }),
    );
    let shift = 0;
    if (minLeft < 0) {
        shift = -minLeft;
    } else if (maxRight > config.availableSpace) {
        shift = config.availableSpace - maxRight;
    }
    rootPlacement.left = lefts[0] + shift;
    if (topOrgs.length > 1) {
        const p = placements.get(topOrgs[1].id);
        if (p && lefts[1] !== undefined) {
            p.left = lefts[1] + shift;
        }
    }
    if (topOrgs.length > 2) {
        const p = placements.get(topOrgs[2].id);
        if (p && lefts[2] !== undefined) {
            p.left = lefts[2] + shift;
        }
    }
    let skipVerticalLevels = false;
    for (const [level, treeLevel] of levelsMap.orderedEntries()) {
        if (level === rootLevel) continue;
        if (skipVerticalLevels) {
            if (treeLevel.orientation === "horizontal") {
                skipVerticalLevels = false;
            } else {
                continue;
            }
        }
        if (treeLevel.orientation === "horizontal") {
            const parentGroups = new Map<number, ConnectedOrg[]>();
            for (const org of treeLevel.orgs) {
                if (org.parent) {
                    const pid = org.parent.id;
                    if (!parentGroups.has(pid)) parentGroups.set(pid, []);
                    parentGroups.get(pid)!.push(org);
                }
            }
            const groupBounds: { left: number; right: number; pid: number }[] =
                [];
            for (const [pid, group] of parentGroups.entries()) {
                let totalWidth = 0;
                for (const org of group) {
                    const p = placements.get(org.id);
                    if (p) totalWidth += p.width;
                }
                totalWidth += config.horizontalSpacing * (group.length - 1);
                const parentPlacement = placements.get(pid);
                let groupLeft =
                    parentPlacement && parentPlacement.left !== undefined
                        ? parentPlacement.left +
                          (parentPlacement.width - totalWidth) / 2
                        : centerOrg(group[0].id, config.availableSpace);
                if (groupLeft < 0) groupLeft = 0;
                if (groupLeft + totalWidth > config.availableSpace)
                    groupLeft = config.availableSpace - totalWidth;
                let offset = groupLeft;
                for (const org of group) {
                    const p = placements.get(org.id);
                    if (p) {
                        p.left = offset;
                        offset += p.width + config.horizontalSpacing;
                    }
                }
                groupBounds.push({
                    pid,
                    left: groupLeft,
                    right: groupLeft + totalWidth,
                });
            }
            groupBounds.sort((a, b) => a.left - b.left);
            for (let i = 1; i < groupBounds.length; i++) {
                const prev = groupBounds[i - 1];
                const curr = groupBounds[i];
                if (prev.right + config.horizontalSpacing > curr.left) {
                    const overlap =
                        prev.right + config.horizontalSpacing - curr.left;
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
            let overallMinLeft = Math.min(...groupBounds.map((gb) => gb.left));
            let overallMaxRight = Math.max(
                ...groupBounds.map((gb) => gb.right),
            );
            let overallShift = 0;
            if (overallMinLeft < 0) {
                overallShift = -overallMinLeft;
            } else if (overallMaxRight > config.availableSpace) {
                overallShift = config.availableSpace - overallMaxRight;
            }
            if (overallShift !== 0) {
                for (const [key, val] of parentGroups.entries()) {
                    const gb = groupBounds.find((g) => g.pid === key);
                    for (const org of val) {
                        const p = placements.get(org.id);
                        if (p && p.left !== undefined && gb) {
                            p.left += overallShift;
                        }
                    }
                }
            }
        } else if (treeLevel.orientation === "vertical") {
            if (!skipVerticalLevels) {
                const parentGroups = new Map<number, ConnectedOrg[]>();
                for (const org of treeLevel.orgs) {
                    if (org.parent) {
                        const pid = org.parent.id;
                        if (!parentGroups.has(pid)) parentGroups.set(pid, []);
                        parentGroups.get(pid)!.push(org);
                    }
                }
                for (const org of treeLevel.orgs) {
                    if (parentGroups.size > 1) {
                        const parentPlacement = placements.get(
                            org!.parent!.id,
                        )!;
                        applyVerticalLeft(
                            [org],
                            parentPlacement.left! + config.verticalChildOffset,
                        );
                    } else {
                        applyVerticalLeft(
                            [org],
                            config.availableSpace / 2 -
                                (placements.get(org.id)?.width || 0) / 2,
                        );
                    }
                }

                // skip all levels until we find a horizontal level
                skipVerticalLevels = true;
            }
        }
    }
    console.log("rootPlacement after all levels", rootPlacement);
    return placements;
}

export function calculateLinesBetweenOrgs(
    levelsMap: TreeLevelMap,
    placements: Map<number, OrgPlacement>,
    config: OrgChartConfig,
) {
    if (!levelsMap.root) return [];
    const lines: OrgLine[] = [];
    function traverse(org: ConnectedOrg) {
        const orgLines = calculateLinesForOrg(levelsMap, org, placements, config);
        lines.push(...orgLines);
        if (org.children && org.children.length > 0) {
            for (const child of org.children) {
                traverse(child);
            }
        }
    }
    traverse(levelsMap.root);
    return lines;
}

function calculateLinesForOrg(
    levelsMap: TreeLevelMap,
    org: ConnectedOrg,
    placements: Map<number, OrgPlacement>,
    config: OrgChartConfig,
) {
    const lines: OrgLine[] = [];
    const placement = placements.get(org.id);
    if (!placement) return lines;
    if (org.children && org.children.length > 0) {
        // Determine if org is in a vertical level
        const orgLevelObj = levelsMap.get(org.level ?? 0);
        const isVerticalLevel = orgLevelObj && orgLevelObj.orientation === "vertical";
        for (const child of org.children) {
            const childPlacement = placements.get(child.id);
            if (childPlacement) {
                const line: OrgLine = { points: [] };
                if (child.level === org.level) {
                    // Draw a horizontal line from parent's center to child's center
                    line.points.push({
                        x: (placement.left || 0) + placement.width / 2,
                        y: placement.top + placement.height / 2,
                    });
                    line.points.push({
                        x: (childPlacement.left || 0) + childPlacement.width / 2,
                        y: childPlacement.top + childPlacement.height / 2,
                    });
                } else if (isVerticalLevel) {
                    // Start point: half of verticalChildOffset from the left of parent
                    const startX = (placement.left || 0) + config.verticalChildOffset / 2;
                    const midY = childPlacement.top + childPlacement.height / 2;
                    // Go down to the middle of the child
                    line.points.push({
                        x: startX,
                        y: placement.top + placement.height,
                    });
                    line.points.push({
                        x: startX,
                        y: midY,
                    });
                    // Go right to connect to the child
                    line.points.push({
                        x: (childPlacement.left || 0) + childPlacement.width / 2,
                        y: midY,
                    });
                } else {
                    // Start point: bottom center of parent
                    line.points.push({
                        x: (placement.left || 0) + placement.width / 2,
                        y: placement.top + placement.height,
                    });
                    // Vertical line down to the level gap above the child
                    const midY = childPlacement.top - config.verticalSpacing / 2;
                    line.points.push({
                        x: (placement.left || 0) + placement.width / 2,
                        y: midY,
                    });
                    // Horizontal line to child's center
                    line.points.push({
                        x: (childPlacement.left || 0) + childPlacement.width / 2,
                        y: midY,
                    });
                    // Vertical line down to top of child
                    line.points.push({
                        x: (childPlacement.left || 0) + childPlacement.width / 2,
                        y: childPlacement.top,
                    });
                }
                lines.push(line);
            }
        }
    }

    return lines;
}
