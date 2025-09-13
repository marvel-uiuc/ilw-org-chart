import { Org } from "./Org";

export interface ConnectedOrg extends Org {
    id: number;
    parent?: ConnectedOrg;
    level?: number;
    children?: ConnectedOrg[];
}

export class TreeLevelOrgsMap extends Map<number, ConnectedOrg[]> {
    [level: number]: ConnectedOrg[];
}

export class LevelOrientationsMap extends Map<
    number,
    "horizontal" | "vertical"
> {
    [level: number]: "horizontal" | "vertical";
}

let orgIdCount = 1;

export function treeLevelOrgs(org: Org): TreeLevelOrgsMap {
    const levelOrgs = new TreeLevelOrgsMap();

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
        if (!levelOrgs.has(level)) {
            levelOrgs.set(level, []);
        }
        levelOrgs.get(level)!.push(connectedNode);
        return connectedNode;
    }

    traverse(org, null, 0);

    console.log(levelOrgs);
    return levelOrgs;
}

export function calculateLevelOrientations(
    levels: TreeLevelOrgsMap,
    minColWidth: number,
    maxTreeWidth: number,
) {
    const orientations = new LevelOrientationsMap();
    // First pass: assign initial orientations
    for (const [level, orgs] of levels.entries()) {
        const requiredWidth = (orgs.length || 1) * minColWidth;
        if (minColWidth <= 0 || maxTreeWidth <= 0) {
            orientations.set(level, "vertical");
        } else if (requiredWidth <= maxTreeWidth) {
            orientations.set(level, "horizontal");
        } else {
            orientations.set(level, "vertical");
        }
    }

    // Second pass: propagate vertical orientation to descendant levels
    // Find all levels that are vertical and propagate
    const visited = new Set<number>();
    function propagateVertical(level: number) {
        if (visited.has(level)) return;
        visited.add(level);
        const orgs = levels.get(level);
        if (!orgs) return;
        for (const org of orgs) {
            if (org.children && org.children.length > 0) {
                // Find the level(s) of children
                // Assume children are always in level+1
                const childLevel = level + 1;
                if (orientations.get(childLevel) !== "vertical") {
                    orientations.set(childLevel, "vertical");
                    propagateVertical(childLevel);
                }
            }
        }
    }
    for (const [level, orientation] of orientations.entries()) {
        if (orientation === "vertical") {
            propagateVertical(Number(level));
        }
    }
    return orientations;
}

/**
 * Measures the height of each level by rendering all orgs for a level together in a container,
 * applying orientation and available space constraints, then measuring the container's height.
 * @param levelsMap TreeLevelOrgsMap - orgs grouped by level
 * @param cssClass string - CSS class to apply for measurement
 * @param availableSpace number - available width in px
 * @param minColWidth number - minimum column width in px
 * @param orientations LevelOrientationsMap - orientation for each level
 * @returns Map<number, number> - level to measured height
 */
export function measureLevelHeights(
    levelsMap: TreeLevelOrgsMap,
    cssClass: string,
    availableSpace: number,
    minColWidth: number,
    maxColWidth: number,
    orientations: LevelOrientationsMap,
): Map<number, number> {
    console.log(
        "[measureLevelHeights] Start measuring level heights",
        levelsMap,
    );
    const startTime = performance.now();

    // Create hidden container
    const container = document.createElement("div");
    // container.style.position = 'absolute';
    // container.style.visibility = 'hidden';
    // container.style.pointerEvents = 'none';
    // container.style.left = '-9999px';
    // container.style.top = '-9999px';
    document.body.appendChild(container);

    const orgSizes = new Map<number, [number, number]>();
    const levelHeights = new Map();

    // Helper to recursively render vertical sub-tree
    function renderVerticalSubtree(
        org: ConnectedOrg,
        parent: HTMLDivElement,
    ): HTMLElement {
        const orgContainer = document.createElement("div");
        orgContainer.className = cssClass + " " + cssClass + "-vertical-org";
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
        // Children
        if (org.children && org.children.length > 0) {
            for (const child of org.children) {
                const childContainer = renderVerticalSubtree(
                    child as ConnectedOrg,
                    parent,
                );
            }
        }
        parent.appendChild(orgContainer);

        const rect = orgContainer.getBoundingClientRect();

        orgSizes.set(org.id, [rect.width, rect.height]);

        return orgContainer;
    }

    let maxLevel = Math.max(...Array.from(levelsMap.keys()));
    let firstVerticalLevel: number | null = null;

    for (let level = 0; level <= maxLevel; level++) {
        const orgs = levelsMap.get(level) || [];
        console.log("level", level, orgs);
        // If before first vertical level, or not a descendant of the first vertical level, measure as usual
        if (
            firstVerticalLevel === null &&
            orientations.get(level) !== "vertical"
        ) {
            const levelContainer = document.createElement("div");
            levelContainer.className =
                cssClass + "-level " + cssClass + "-horizontal";

            const columnWidth = Math.min(
                availableSpace / orgs.length,
                maxColWidth,
            );

            levelContainer.style.width = availableSpace + "px";
            container.appendChild(levelContainer);

            for (const org of orgs) {
                const el = document.createElement("div");
                el.className = cssClass;
                if (org.large) {
                    el.className += " " + cssClass + "-large";
                }
                el.style.maxWidth = columnWidth + "px";

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
                orgSizes.set(org.id, [rect.width, rect.height]);
            }
            const height = levelContainer.getBoundingClientRect().height;
            levelHeights.set(level, height);
        } else if (
            firstVerticalLevel === null &&
            orientations.get(level) === "vertical"
        ) {
            // Find all the unique parents of this level's orgs
            const verticalContainer = document.createElement("div");
            verticalContainer.className =
                cssClass + "-level "+ cssClass + "-vertical";
            verticalContainer.style.width = availableSpace + "px";
            container.appendChild(verticalContainer);
            const uniqueParents = new Set<ConnectedOrg>();
            for (const org of orgs) {
                if (org.parent) {
                    uniqueParents.add(org.parent);
                }
            }
            let verticalHeights: number[] = [];
            for (const org of uniqueParents) {
                const subtreeContainer = document.createElement("div");
                subtreeContainer.className = cssClass + "-vertical-subtree";
                const width = orgSizes.get(org.id)![0];
                subtreeContainer.style.maxWidth = width + "px";
                verticalContainer.appendChild(subtreeContainer);
                for (const child of org.children || []) {
                    if (child.level === level) {
                        const orgSubtree = renderVerticalSubtree(
                            child,
                            subtreeContainer,
                        );
                    }
                }
                const height = subtreeContainer.getBoundingClientRect().height;
                verticalHeights.push(height);
            }
            levelHeights.set(level, Math.max(...verticalHeights));
        } else {
            // skip levels that are descendants of the first vertical level
        }
    }

    // document.body.removeChild(container);
    const endTime = performance.now();
    const duration = endTime - startTime;
    console.log(
        `[measureLevelHeights] Finished measuring. Duration: ${duration.toFixed(2)} ms`,
    );
    return levelHeights;
}
