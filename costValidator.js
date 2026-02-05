export class CostValidator {
    /**
     * Validate and choose dice indices for a cost.
     * @param {Array<string>} dicePool
     * @param {Object|Array} cost
     * @param {string} activeElement
     * @returns {{ success: boolean, paidIndices: number[] }}
     */
    static check(dicePool, cost, activeElement) {
        if (!cost) return { success: true, paidIndices: [] };
        const costs = Array.isArray(cost) ? cost : [cost];
        if (!costs.length) return { success: true, paidIndices: [] };

        const pool = Array.isArray(dicePool)
            ? dicePool.map((t, i) => ({ type: t, index: i, used: false }))
            : [];
        const paid = [];

        const take = (predicate, count) => {
            let remaining = count;
            for (const die of pool) {
                if (remaining <= 0) break;
                if (!die.used && predicate(die)) {
                    die.used = true;
                    paid.push(die.index);
                    remaining--;
                }
            }
            return remaining === 0;
        };

        const takeElement = (element, count) => {
            if (!element) return false;
            const okExact = take(d => d.type === element, count);
            if (okExact) return true;
            const usedExact = paid.filter(i => dicePool[i] === element).length;
            const remaining = Math.max(0, count - usedExact);
            return take(d => d.type === 'Omni', remaining);
        };

        const takeAny = (count) => take(d => !d.used, count);

        for (const item of costs) {
            const type = item?.type;
            const count = Number(item?.count || 0);
            if (count <= 0) continue;

            if (type === 'Matching') {
                if (!takeElement(activeElement, count)) return { success: false, paidIndices: [] };
                continue;
            }

            if (type === 'Same') {
                const elements = ['Cryo', 'Hydro', 'Pyro', 'Electro', 'Anemo', 'Geo', 'Dendro'];
                let satisfied = false;
                for (const el of elements) {
                    const available = pool.filter(d => !d.used && (d.type === el || d.type === 'Omni')).length;
                    if (available >= count) {
                        if (!take(d => d.type === el, count)) {
                            const usedEl = paid.filter(i => dicePool[i] === el).length;
                            const remaining = Math.max(0, count - usedEl);
                            take(d => d.type === 'Omni', remaining);
                        }
                        satisfied = true;
                        break;
                    }
                }
                if (!satisfied) return { success: false, paidIndices: [] };
                continue;
            }

            if (type === 'Unaligned' || type === 'Common' || type === 'Any') {
                if (!takeAny(count)) return { success: false, paidIndices: [] };
                continue;
            }

            if (type === 'Omni') {
                if (!take(d => d.type === 'Omni', count)) return { success: false, paidIndices: [] };
                continue;
            }

            const elementTypes = ['Cryo', 'Hydro', 'Pyro', 'Electro', 'Anemo', 'Geo', 'Dendro'];
            if (elementTypes.includes(type)) {
                if (!takeElement(type, count)) return { success: false, paidIndices: [] };
                continue;
            }

            if (!takeAny(count)) return { success: false, paidIndices: [] };
        }

        return { success: true, paidIndices: paid.sort((a, b) => a - b) };
    }
}

