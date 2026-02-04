// damagePipeline.js
import { globalBus } from './eventBus.js';

// 元素定义
const ELEMENTS = ['Cryo', 'Hydro', 'Pyro', 'Electro', 'Anemo', 'Geo', 'Dendro'];

// 反应查表
const REACTIONS = {
    'Cryo_Pyro': { name: 'Melt', dmg: 2 },
    'Pyro_Cryo': { name: 'Melt', dmg: 2 },
    'Hydro_Pyro': { name: 'Vaporize', dmg: 2 },
    'Pyro_Hydro': { name: 'Vaporize', dmg: 2 },

    'Electro_Pyro': { name: 'Overloaded', dmg: 2, effect: 'Switch' },
    'Pyro_Electro': { name: 'Overloaded', dmg: 2, effect: 'Switch' },

    'Cryo_Electro': { name: 'Superconduct', dmg: 1, effect: 'Piercing' },
    'Electro_Cryo': { name: 'Superconduct', dmg: 1, effect: 'Piercing' },

    'Hydro_Electro': { name: 'Electro-Charged', dmg: 1, effect: 'Piercing' },
    'Electro_Hydro': { name: 'Electro-Charged', dmg: 1, effect: 'Piercing' },

    'Hydro_Cryo': { name: 'Frozen', dmg: 1, effect: 'Freeze' },
    'Cryo_Hydro': { name: 'Frozen', dmg: 1, effect: 'Freeze' },

    'Geo_Cryo': { name: 'Crystallize', dmg: 1, effect: 'Shield' },
    'Geo_Hydro': { name: 'Crystallize', dmg: 1, effect: 'Shield' },
    'Geo_Pyro': { name: 'Crystallize', dmg: 1, effect: 'Shield' },
    'Geo_Electro': { name: 'Crystallize', dmg: 1, effect: 'Shield' },

    // Anemo Swirls handled dynamically usually, but simplified here
    'Anemo_Cryo': { name: 'Swirl', dmg: 0, effect: 'Spread' },
    'Anemo_Hydro': { name: 'Swirl', dmg: 0, effect: 'Spread' },
    'Anemo_Pyro': { name: 'Swirl', dmg: 0, effect: 'Spread' },
    'Anemo_Electro': { name: 'Swirl', dmg: 0, effect: 'Spread' },

    'Dendro_Pyro': { name: 'Burning', dmg: 1, effect: 'Summon_Burn' },
    'Pyro_Dendro': { name: 'Burning', dmg: 1, effect: 'Summon_Burn' },

    'Dendro_Hydro': { name: 'Bloom', dmg: 1, effect: 'Core' },
    'Hydro_Dendro': { name: 'Bloom', dmg: 1, effect: 'Core' },

    'Dendro_Electro': { name: 'Quicken', dmg: 1, effect: 'Catalyze' },
    'Electro_Dendro': { name: 'Quicken', dmg: 1, effect: 'Catalyze' }
};

export class DamagePipeline {
    /**
     * @param {Object} attackerState 攻击者 (Character object)
     * @param {Object} targetState 受击者 (Character object)
     * @param {Object} skillInfo { damage: { base: number, element: string, type: string } }
     * @param {Object} gameState 全局游戏状态 (用于访问队友、环境)
     */
    static calculate(attackerState, targetState, skillInfo, gameState) {
        // 初始化上下文
        const context = {
            attacker: attackerState,
            target: targetState,
            originalDamage: skillInfo.damage.base,
            damageValue: skillInfo.damage.base,
            elementType: skillInfo.damage.element, // 当前伤害的元素类型
            damageType: skillInfo.damage.type || 'Normal', // Normal, Skill, Burst
            reaction: null,
            piercing: 0, // 穿透伤害 (对后台)
            log: [],
            sideEffects: [] // 待执行的副作用 (如切换角色、生成护盾)
        };

        context.log.push(`基础伤害: ${context.damageValue} (${context.elementType})`);

        // Step 1: 元素附着与反应检测
        this.stepReaction(context);

        // Step 2: 伤害加成 (装备、状态、反应基础增幅)
        this.stepBonuses(context, gameState);

        // Step 3: 防御与减免 (减伤状态)
        this.stepMitigation(context);

        // Step 4: 护盾抵扣
        this.stepShields(context, gameState);

        // Step 5: 穿透伤害处理 (在这里主要是记录，不直接扣血，扣血在 main 执行)
        // 注意：穿透伤害通常是固定的，不受增益减免影响

        return context;
    }

    static stepReaction(ctx) {
        if (!ctx.elementType || ctx.elementType === 'Physical') return;

        const attached = ctx.target.elementAttachment;
        if (attached) {
            const key = `${ctx.elementType}_${attached}`;
            const reaction = REACTIONS[key];

            if (reaction) {
                ctx.reaction = reaction;
                ctx.log.push(`触发反应: ${reaction.name}`);

                // 反应基础增伤
                ctx.damageValue += reaction.dmg;

                // 大部分反应会消耗附着 (简化处理：全部消耗)
                // 原神中 草+雷(激化) 是特殊状态，这里先简化为消耗
                ctx.target.elementAttachment = null;
                ctx.log.push(`元素附着已消耗: ${attached}`);
            }
        } else {
            // 无附着，施加新附着
            // 注意：风/岩通常不附着
            if (ctx.elementType !== 'Anemo' && ctx.elementType !== 'Geo') {
                ctx.target.elementAttachment = ctx.elementType;
                ctx.log.push(`施加附着: ${ctx.elementType}`);
            }
        }
    }

    static stepBonuses(ctx, gameState) {
        // 1. 装备加成 (示例：狼末)
        // 假设装备数据结构: attacker.equipment = [{ name: 'wp_wolf' }]
        // 这里只是示意，实际需要读取具体卡牌逻辑
        const hasWolf = ctx.attacker.equipment && ctx.attacker.equipment.some(e => e.id === 'wp_wolf');
        if (hasWolf && ctx.target.hp <= 6) {
             ctx.damageValue += 2; // 假设狼末对低血量+2
             ctx.log.push("装备效果(狼的末路): +2");
        }

        // 2. 状态加成 (e.g. 激化领域)
        // 检查我方 Combat Status
        const player = Object.values(gameState.players).find(p => p.characters[ctx.attacker.id]);
        if (player) {
        const catalyzeField = player.combatStatuses.find(s => s.name === '\u6fc0\u5316\u9886\u57df');
            if (catalyzeField && (ctx.elementType === 'Electro' || ctx.elementType === 'Dendro')) {
                ctx.damageValue += 1;
                ctx.log.push("状态效果(激化领域): +1");
            }
        }
    }

    static stepMitigation(ctx) {
        // 1. 角色状态减伤 (e.g. 莲花酥 - 本回合下一次受到的伤害-3)
        // 注意：这通常在受击时触发。这里假设 statuses 包含此类buff
        const lotusIndex = ctx.target.statuses.findIndex(s => s.name === '\u83b2\u82b1\u9165');
        if (lotusIndex !== -1) {
            const reduce = 3;
            const actualReduce = Math.min(ctx.damageValue, reduce);
            ctx.damageValue -= actualReduce;
            ctx.log.push(`状态效果(莲花酥): -${actualReduce}`);
            // 莲花酥通常是一次性的，需标记移除 (在外部处理移除逻辑，这里只计算)
            ctx.sideEffects.push({ type: 'REMOVE_STATUS', targetId: ctx.target.id, statusName: '\u83b2\u82b1\u9165' });
        }
    }

    static stepShields(ctx, gameState) {
        if (ctx.damageValue <= 0) return;

        // 获取受击方玩家
        const player = Object.values(gameState.players).find(p => p.characters[ctx.target.id]);
        if (!player) return;

        // 1. 角色护盾 (Character Status)
        // e.g. 护心铠
        ctx.target.statuses.forEach(status => {
            if (status.type === 'Shield' && ctx.damageValue > 0) {
                const absorb = Math.min(ctx.damageValue, status.value);
                ctx.damageValue -= absorb;
                status.value -= absorb; // 直接修改引用，实际应通过 mutation
                ctx.log.push(`护盾抵消(${status.name}): -${absorb}`);
                if (status.value <= 0) {
                     ctx.sideEffects.push({ type: 'REMOVE_STATUS', targetId: ctx.target.id, statusName: status.name });
                }
            }
        });

        // 2. 出战状态护盾 (Combat Status)
        // e.g. 结晶盾
        player.combatStatuses.forEach(status => {
            if (status.type === 'Shield' && ctx.damageValue > 0) {
                const absorb = Math.min(ctx.damageValue, status.value);
                ctx.damageValue -= absorb;
                status.value -= absorb;
                ctx.log.push(`出战护盾抵消(${status.name}): -${absorb}`);
                if (status.value <= 0) {
                     ctx.sideEffects.push({ type: 'REMOVE_COMBAT_STATUS', playerId: player.id, statusName: status.name });
                }
            }
        });
    }
}
