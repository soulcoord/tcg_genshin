// damagePipeline.js
import { globalBus } from './eventBus.js';

const ELEMENTS = ['Cryo', 'Hydro', 'Pyro', 'Electro', 'Anemo', 'Geo', 'Dendro'];

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
     * @param {Object} attackerState
     * @param {Object} targetState
     * @param {Object} skillInfo { damage: { base, element, type } }
     * @param {Object} gameState
     * @param {Object} options
     */
    static calculate(attackerState, targetState, skillInfo, gameState, options = {}) {
        const players = Object.values(gameState.players || {});
        const attackerPlayer = players.find(p => p.characters && p.characters[attackerState.id]);
        const targetPlayer = players.find(p => p.characters && p.characters[targetState.id]);

        const context = {
            attacker: attackerState,
            target: targetState,
            attackerPlayerId: attackerPlayer?.id || null,
            targetPlayerId: targetPlayer?.id || null,
            isTargetActive: Boolean(targetPlayer && targetPlayer.activeCharId === targetState.id),
            originalDamage: skillInfo?.damage?.base || 0,
            damageValue: skillInfo?.damage?.base || 0,
            elementType: skillInfo?.damage?.element || 'Physical',
            damageType: skillInfo?.damage?.type || 'Normal',
            reaction: null,
            piercing: 0,
            log: [],
            sideEffects: [],
            options
        };

        context.log.push(`Base: ${context.damageValue} (${context.elementType})`);

        if (!options.ignoreReactions) {
            this.stepReaction(context);
        } else {
            // Apply attachment if no reaction processing is desired
            this.applyAttachment(context);
        }

        this.stepBonuses(context, gameState);
        this.stepMitigation(context);
        this.stepShields(context, gameState);

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
                ctx.log.push(`Reaction: ${reaction.name}`);
                ctx.damageValue += reaction.dmg;

                // Consume attachment
                ctx.target.elementAttachment = null;

                switch (reaction.effect) {
                    case 'Switch':
                        if (ctx.isTargetActive && ctx.targetPlayerId) {
                            ctx.sideEffects.push({ type: 'FORCE_SWITCH', playerId: ctx.targetPlayerId });
                        }
                        break;
                    case 'Piercing':
                        if (ctx.targetPlayerId) {
                            ctx.sideEffects.push({ type: 'PIERCE_BACKLINE', playerId: ctx.targetPlayerId, amount: 1 });
                        }
                        break;
                    case 'Freeze':
                        ctx.sideEffects.push({
                            type: 'ADD_STATUS',
                            targetId: ctx.target.id,
                            status: { name: 'Frozen', type: 'Freeze', duration: 1 }
                        });
                        break;
                    case 'Shield':
                        if (ctx.attackerPlayerId) {
                            ctx.sideEffects.push({
                                type: 'ADD_COMBAT_STATUS',
                                playerId: ctx.attackerPlayerId,
                                status: { name: 'Crystallize Shield', type: 'Shield', value: 1, max: 2 }
                            });
                        }
                        break;
                    case 'Spread':
                        if (ctx.targetPlayerId) {
                            ctx.sideEffects.push({
                                type: 'DAMAGE_OTHERS',
                                playerId: ctx.targetPlayerId,
                                element: attached,
                                amount: 1
                            });
                        }
                        break;
                    case 'Summon_Burn':
                        if (ctx.attackerPlayerId) {
                            ctx.sideEffects.push({
                                type: 'ADD_SUMMON',
                                playerId: ctx.attackerPlayerId,
                                summon: { name: 'Burning Flame', uses: 1, element: 'Pyro', trigger: 'end' }
                            });
                        }
                        break;
                    case 'Core':
                        if (ctx.attackerPlayerId) {
                            ctx.sideEffects.push({
                                type: 'ADD_COMBAT_STATUS',
                                playerId: ctx.attackerPlayerId,
                                status: { name: 'Dendro Core', type: 'Field', uses: 1 }
                            });
                        }
                        break;
                    case 'Catalyze':
                        if (ctx.attackerPlayerId) {
                            ctx.sideEffects.push({
                                type: 'ADD_COMBAT_STATUS',
                                playerId: ctx.attackerPlayerId,
                                status: { name: 'Catalyzing Field', type: 'Field', uses: 2 }
                            });
                        }
                        break;
                }
                return;
            }
        }

        this.applyAttachment(ctx);
    }

    static applyAttachment(ctx) {
        if (ctx.elementType === 'Anemo' || ctx.elementType === 'Geo') return;
        if (!ctx.target.elementAttachment) {
            ctx.target.elementAttachment = ctx.elementType;
        }
    }

    static stepBonuses(ctx, gameState) {
        // Example weapon effect
        const hasWolf = ctx.attacker.equipment && ctx.attacker.equipment.some(e => e.id === 'wp_wolf');
        if (hasWolf && ctx.target.hp <= 6) {
            ctx.damageValue += 2;
            ctx.log.push('Weapon bonus: +2');
        }

        // Frozen vulnerability: Pyro or Physical +2 and remove Frozen
        const frozenIndex = ctx.target.statuses?.findIndex(s => s.name === 'Frozen') ?? -1;
        if (frozenIndex !== -1 && (ctx.elementType === 'Pyro' || ctx.elementType === 'Physical')) {
            ctx.damageValue += 2;
            ctx.sideEffects.push({ type: 'REMOVE_STATUS', targetId: ctx.target.id, statusName: 'Frozen' });
        }

        // Field bonuses (Catalyzing Field / Dendro Core)
        const player = Object.values(gameState.players || {}).find(p => p.characters && p.characters[ctx.attacker.id]);
        if (player) {
            const core = player.combatStatuses?.find(s => s.name === 'Dendro Core');
            if (core && (ctx.elementType === 'Pyro' || ctx.elementType === 'Electro') && ctx.isTargetActive) {
                ctx.damageValue += 2;
                core.uses = Math.max(0, (core.uses || 1) - 1);
                if (core.uses === 0) {
                    ctx.sideEffects.push({ type: 'REMOVE_COMBAT_STATUS', playerId: player.id, statusName: core.name });
                }
            }

            const catalyze = player.combatStatuses?.find(s => s.name === 'Catalyzing Field');
            if (catalyze && (ctx.elementType === 'Electro' || ctx.elementType === 'Dendro') && ctx.isTargetActive) {
                ctx.damageValue += 1;
                catalyze.uses = Math.max(0, (catalyze.uses || 1) - 1);
                if (catalyze.uses === 0) {
                    ctx.sideEffects.push({ type: 'REMOVE_COMBAT_STATUS', playerId: player.id, statusName: catalyze.name });
                }
            }
        }
    }

    static stepMitigation(ctx) {
        const lotusIndex = ctx.target.statuses?.findIndex(s => s.name === 'Lotus Crisps' || s.name === '莲花酥') ?? -1;
        if (lotusIndex !== -1) {
            const reduce = 3;
            const actualReduce = Math.min(ctx.damageValue, reduce);
            ctx.damageValue -= actualReduce;
            ctx.sideEffects.push({ type: 'REMOVE_STATUS', targetId: ctx.target.id, statusName: 'Lotus Crisps' });
        }
    }

    static stepShields(ctx, gameState) {
        if (ctx.damageValue <= 0) return;
        const player = Object.values(gameState.players || {}).find(p => p.characters && p.characters[ctx.target.id]);
        if (!player) return;

        ctx.target.statuses?.forEach(status => {
            if (status.type === 'Shield' && ctx.damageValue > 0) {
                const absorb = Math.min(ctx.damageValue, status.value || 0);
                ctx.damageValue -= absorb;
                status.value = (status.value || 0) - absorb;
                if (status.value <= 0) {
                    ctx.sideEffects.push({ type: 'REMOVE_STATUS', targetId: ctx.target.id, statusName: status.name });
                }
            }
        });

        player.combatStatuses?.forEach(status => {
            if (status.type === 'Shield' && ctx.damageValue > 0) {
                const absorb = Math.min(ctx.damageValue, status.value || 0);
                ctx.damageValue -= absorb;
                status.value = (status.value || 0) - absorb;
                if (status.value <= 0) {
                    ctx.sideEffects.push({ type: 'REMOVE_COMBAT_STATUS', playerId: player.id, statusName: status.name });
                }
            }
        });
    }
}

