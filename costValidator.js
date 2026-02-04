export class CostValidator {
    /**
     * @param {Array} dicePool 当前拥有的骰子
     * @param {Object} cost 卡牌费用
     * @param {String} activeElement 当前角色元素
     */
    static check(dicePool, cost, activeElement) {
        if (!cost || cost.count === 0) return { success: true, paidIndices: [] };

        const paidIndices = [];
        let required = cost.count;
        
        // 目标元素：如果是匹配费用，则必须是当前角色元素；否则为 null
        const targetElement = cost.type === 'Matching' ? activeElement : null;

        // 1. 优先扣除匹配的元素骰子
        if (targetElement) {
            for (let i = 0; i < dicePool.length; i++) {
                if (required > 0 && dicePool[i] === targetElement) {
                    paidIndices.push(i);
                    required--;
                }
            }
        }

        // 2. 其次扣除万能骰子 (Omni)
        for (let i = 0; i < dicePool.length; i++) {
            // 确保不重复使用已被选中的骰子
            if (required > 0 && dicePool[i] === 'Omni' && !paidIndices.includes(i)) {
                paidIndices.push(i);
                required--;
            }
        }
        
        // 3. 结果判定
        if (required === 0) {
            return { success: true, paidIndices };
        } else {
            return { success: false, paidIndices: [] };
        }
    }
}