// damagePipeline.js
// 伤害计算管线
export class DamagePipeline {
    static calculate(attacker, target, skill) {
        let damage = {
            value: skill.damage.base,
            element: skill.damage.element,
            type: skill.type 
        };

        // 1. 基础增益阶段
        // 逻辑：如果装备了狼末，基础伤害+1 (这里是简化模拟)
        if (attacker.equipment && attacker.equipment.weapon === 'wp_wolf') {
            damage.value += 1; 
        }

        // 2. 元素反应阶段
        // 逻辑：火打冰 -> 融化 -> 伤害+2
        if (target.elementAttachment === 'Cryo' && damage.element === 'Pyro') {
            console.log(">>> 触发反应：融化 (Melt)！伤害 +2");
            damage.value += 2; 
        }

        return damage;
    }
}