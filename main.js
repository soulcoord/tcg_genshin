import { initView } from './view.js';
import { gameFSM, PHASES } from './fsm.js';
import { globalBus } from './eventBus.js';
import { DamagePipeline } from './damagePipeline.js';
import { rollDice } from './dice.js';
import { gameState } from './model.js';
import { CostValidator } from './costValidator.js';
import { GameMechanics } from './gameMechanics.js';

initView();

const rerollUsed = { p1: false, p2: false };
let pendingSwitch = null; // { playerId, reason }

function shuffleDeck(deck) {
    const arr = Array.isArray(deck) ? [...deck] : [];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getPlayer(id) {
    return gameState.players[id];
}

function getOpponent(id) {
    return id === 'p1' ? gameState.players.p2 : gameState.players.p1;
}

function getAliveCharacters(player) {
    return Object.values(player.characters || {}).filter(c => c.isAlive && c.hp > 0);
}

function removeDiceByIndices(player, indices) {
    if (!Array.isArray(indices) || indices.length === 0) return;
    const newDice = [...(player.dice || [])];
    indices.sort((a, b) => b - a).forEach(i => {
        if (i >= 0 && i < newDice.length) newDice.splice(i, 1);
    });
    player.dice = newDice;
}

function capDice(player) {
    if (!Array.isArray(player.dice)) player.dice = [];
    if (player.dice.length > 16) player.dice = player.dice.slice(0, 16);
}

function addEnergy(character, amount = 1) {
    if (!character) return;
    const next = Math.min(character.maxEnergy || 3, (character.energy || 0) + amount);
    character.energy = next;
}

function resetCharacterOnDefeat(character) {
    character.isAlive = false;
    character.energy = 0;
    character.statuses = [];
    character.equipment = [];
    character.elementAttachment = null;
}

function checkVictory() {
    const p1Alive = getAliveCharacters(gameState.players.p1).length;
    const p2Alive = getAliveCharacters(gameState.players.p2).length;
    if (p1Alive === 0 || p2Alive === 0) {
        globalBus.emit('GAME_OVER', { winner: p1Alive === 0 && p2Alive === 0 ? 'draw' : (p1Alive > 0 ? 'p1' : 'p2') });
        gameFSM.transitionTo(PHASES.GAME_OVER);
    }
}

function forceSwitch(playerId, reason = 'forced') {
    const player = getPlayer(playerId);
    const alive = getAliveCharacters(player);
    if (alive.length === 0) return;

    if (playerId === 'p1') {
        if (pendingSwitch && pendingSwitch.playerId === 'p1') return;
        pendingSwitch = { playerId, reason };
        globalBus.emit('SHOW_ACTIVE_SELECT', { reason: 'forced' });
    } else {
        player.activeCharId = alive[0].id;
    }
}

function handleKnockout(playerId, charId) {
    const player = getPlayer(playerId);
    const char = player.characters[charId];
    if (!char || !char.isAlive) return;
    resetCharacterOnDefeat(char);

    if (player.activeCharId === charId) {
        forceSwitch(playerId, 'defeat');
    }
}

function applyPiercing(playerId, amount) {
    const player = getPlayer(playerId);
    const activeId = player.activeCharId;
    Object.values(player.characters || {}).forEach(char => {
        if (!char.isAlive || char.id === activeId) return;
        char.hp = Math.max(0, char.hp - amount);
        if (char.hp === 0) handleKnockout(playerId, char.id);
    });
}

function applySecondaryDamage(attacker, targetPlayerId, targetCharId, element, amount) {
    const targetPlayer = getPlayer(targetPlayerId);
    const target = targetPlayer.characters[targetCharId];
    if (!target || !target.isAlive) return;
    const ctx = DamagePipeline.calculate(attacker, target, {
        damage: { base: amount, element, type: 'Secondary' }
    }, gameState);
    if (ctx.damageValue > 0) {
        target.hp = Math.max(0, target.hp - ctx.damageValue);
    }
    applySideEffects(ctx);
    if (target.hp === 0) handleKnockout(targetPlayerId, target.id);
}

function applySideEffects(ctx) {
    ctx.sideEffects.forEach(effect => {
        switch (effect.type) {
            case 'REMOVE_STATUS': {
                const target = findCharacter(effect.targetId);
                if (target) {
                    target.statuses = (target.statuses || []).filter(s => s.name !== effect.statusName);
                }
                break;
            }
            case 'ADD_STATUS': {
                const target = findCharacter(effect.targetId);
                if (target) {
                    const rest = (target.statuses || []).filter(s => s.name !== effect.status.name);
                    target.statuses = [...rest, effect.status];
                }
                break;
            }
            case 'REMOVE_COMBAT_STATUS': {
                const player = getPlayer(effect.playerId);
                player.combatStatuses = (player.combatStatuses || []).filter(s => s.name !== effect.statusName);
                break;
            }
            case 'ADD_COMBAT_STATUS': {
                const player = getPlayer(effect.playerId);
                const list = [...(player.combatStatuses || [])];
                const existing = list.find(s => s.name === effect.status.name);
                if (existing) {
                    if (existing.type === 'Shield') {
                        const max = effect.status.max || 2;
                        existing.value = Math.min(max, (existing.value || 0) + (effect.status.value || 0));
                    } else if (typeof existing.uses === 'number' && typeof effect.status.uses === 'number') {
                        existing.uses += effect.status.uses;
                    }
                } else {
                    list.push({ ...effect.status });
                }
                player.combatStatuses = list;
                break;
            }
            case 'ADD_SUMMON': {
                const player = getPlayer(effect.playerId);
                const list = [...(player.summons || [])];
                const existing = list.find(s => s.name === effect.summon.name);
                if (existing) {
                    if (typeof existing.uses === 'number' && typeof effect.summon.uses === 'number') {
                        existing.uses = Math.min(2, existing.uses + effect.summon.uses);
                    }
                    player.summons = list;
                } else {
                    GameMechanics.addSummon(player, { ...effect.summon });
                }
                break;
            }
            case 'FORCE_SWITCH': {
                forceSwitch(effect.playerId, 'forced');
                break;
            }
            case 'PIERCE_BACKLINE': {
                applyPiercing(effect.playerId, effect.amount || 1);
                break;
            }
            case 'DAMAGE_OTHERS': {
                const targetPlayer = getPlayer(effect.playerId);
                const attackerPlayer = getPlayer(ctx.attackerPlayerId || 'p1');
                const attacker = attackerPlayer.characters[attackerPlayer.activeCharId] || getAliveCharacters(attackerPlayer)[0];
                if (!attacker) break;
                const activeId = targetPlayer.activeCharId;
                Object.values(targetPlayer.characters || {}).forEach(char => {
                    if (!char.isAlive || char.id === activeId) return;
                    applySecondaryDamage(attacker, targetPlayer.id, char.id, effect.element, effect.amount || 1);
                });
                break;
            }
        }
    });
}

function findCharacter(charId) {
    const p1 = gameState.players.p1.characters[charId];
    if (p1) return p1;
    return gameState.players.p2.characters[charId] || null;
}

function resolveDamage(attackerPlayerId, targetPlayerId, attacker, target, skillInfo) {
    const ctx = DamagePipeline.calculate(attacker, target, skillInfo, gameState);
    if (ctx.damageValue > 0) {
        target.hp = Math.max(0, target.hp - ctx.damageValue);
    }
    applySideEffects(ctx);
    if (target.hp === 0) handleKnockout(targetPlayerId, target.id);
    checkVictory();
    return ctx;
}

function parseSkillDamage(skillData, attacker) {
    const desc = (skillData?.description || '').replace(/\s+/g, '');
    let base = 0;
    let element = attacker.element || 'Physical';

    const physicalMatch = desc.match(/造成(\d+)(点|點)物理伤害|造成(\d+)(点|點)物理傷害/);
    if (physicalMatch) {
        base = Number(physicalMatch[1] || physicalMatch[3] || 0);
        element = 'Physical';
        return { base, element };
    }

    const dmgMatch = desc.match(/造成(\d+)(点|點)/);
    if (dmgMatch) base = Number(dmgMatch[1] || 0);

    const elementMap = {
        '冰元素伤害': 'Cryo',
        '冰元素傷害': 'Cryo',
        '水元素伤害': 'Hydro',
        '水元素傷害': 'Hydro',
        '火元素伤害': 'Pyro',
        '火元素傷害': 'Pyro',
        '雷元素伤害': 'Electro',
        '雷元素傷害': 'Electro',
        '风元素伤害': 'Anemo',
        '风元素傷害': 'Anemo',
        '岩元素伤害': 'Geo',
        '岩元素傷害': 'Geo',
        '草元素伤害': 'Dendro',
        '草元素傷害': 'Dendro'
    };

    for (const key of Object.keys(elementMap)) {
        if (desc.includes(key)) {
            element = elementMap[key];
            break;
        }
    }

    return { base, element };
}

function isBurstSkill(skillData, slot) {
    if (slot === 'burst') return true;
    const type = skillData?.type || '';
    if (type.includes('Burst')) return true;
    const desc = skillData?.description || '';
    return desc.includes('元素爆发') || desc.includes('元素爆發') || desc.includes('爆发') || desc.includes('爆發');
}

function splitSkillCost(skillData, attacker, slot) {
    const costList = Array.isArray(skillData?.cost) ? skillData.cost : [];
    const diceCost = [];
    let energyCost = 0;
    const burst = isBurstSkill(skillData, slot);

    costList.forEach(c => {
        if (burst && c.type === 'Omni') {
            energyCost += Number(c.count || 0);
        } else {
            diceCost.push(c);
        }
    });

    if (burst && energyCost === 0) {
        energyCost = attacker.maxEnergy || 3;
    }

    return { diceCost, energyCost };
}

function handleTurnSwitch(isCombatAction) {
    if (!isCombatAction) return;

    const currentId = gameState.activePlayerId;
    const nextId = currentId === 'p1' ? 'p2' : 'p1';

    if (gameState.players[nextId].hasEndedRound) {
        if (gameState.players[currentId].hasEndedRound) {
            gameFSM.transitionTo(PHASES.END);
        } else {
            if (currentId === 'p2') {
                setTimeout(() => globalBus.emit('CMD_OPPONENT_ACT'), 500);
            }
        }
    } else {
        gameState.activePlayerId = nextId;
        if (nextId === 'p2') {
            globalBus.emit('CMD_OPPONENT_ACT');
        }
    }
}

// --- Setup and mulligan ---

globalBus.on('DECK_READY', () => {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;
    p1.deck = shuffleDeck(p1.deck);
    p2.deck = shuffleDeck(p2.deck);

    GameMechanics.drawCards(p1, 5);
    GameMechanics.drawCards(p2, 5);

    globalBus.emit('SHOW_MULLIGAN');
});

globalBus.on('CONFIRM_MULLIGAN', ({ cardIds }) => {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;
    const ids = Array.isArray(cardIds) ? cardIds : [];

    if (ids.length > 0) {
        const toReplace = p1.hand.filter(c => ids.includes(c.id));
        p1.hand = p1.hand.filter(c => !ids.includes(c.id));
        p1.deck = shuffleDeck([...(p1.deck || []), ...toReplace]);
        GameMechanics.drawCards(p1, toReplace.length);
    }

    // Simple AI mulligan: replace 0-2 random cards
    const aiReplaceCount = Math.min(2, Math.floor(Math.random() * 3));
    if (aiReplaceCount > 0) {
        const aiHand = [...p2.hand];
        const replace = aiHand.splice(0, aiReplaceCount);
        p2.hand = aiHand;
        p2.deck = shuffleDeck([...(p2.deck || []), ...replace]);
        GameMechanics.drawCards(p2, aiReplaceCount);
    }

    globalBus.emit('SHOW_ACTIVE_SELECT', { reason: 'initial' });
});

globalBus.on('CONFIRM_ACTIVE_SELECT', ({ targetId, reason }) => {
    const p1 = gameState.players.p1;
    if (!targetId || !p1.characters[targetId]) return;

    p1.activeCharId = targetId;
    pendingSwitch = null;

    if (reason === 'initial') {
        const p2 = gameState.players.p2;
        const alive = getAliveCharacters(p2);
        if (alive.length) p2.activeCharId = alive[0].id;
        gameFSM.transitionTo(PHASES.ROLL);
    }
});

// --- Roll phase ---

globalBus.on('CMD_ROLL_DICE_PHASE', () => {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    p1.dice = rollDice(8);
    p2.dice = rollDice(8);
    capDice(p1);
    capDice(p2);

    rerollUsed.p1 = false;
    rerollUsed.p2 = false;
});

function rerollDice(player, indices) {
    const dice = [...(player.dice || [])];
    const targets = Array.isArray(indices) && indices.length > 0
        ? indices.filter(i => i >= 0 && i < dice.length)
        : dice.map((_, i) => i);

    const newRolls = rollDice(targets.length);
    targets.forEach((idx, i) => { dice[idx] = newRolls[i]; });
    player.dice = dice;
    capDice(player);
}

globalBus.on('ACTION_REROLL_DICE', ({ indices }) => {
    if (gameFSM.currentPhase !== PHASES.ROLL) return;
    if (rerollUsed.p1) return;
    rerollDice(gameState.players.p1, indices);
    rerollUsed.p1 = true;
    globalBus.emit('CLEAR_DICE_SELECTION');
});

// --- Actions ---

globalBus.on('ACTION_PLAY_CARD', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;
    if (pendingSwitch && pendingSwitch.playerId === 'p1') return;

    const player = gameState.players.p1;
    const cardIndex = player.hand.findIndex(c => c.id === data.cardId);
    if (cardIndex === -1) return;
    const card = player.hand[cardIndex];

    const activeChar = player.characters[player.activeCharId];
    const result = CostValidator.check(player.dice, card.cost, activeChar.element);
    if (!result.success) {
        alert('Not enough dice.');
        return;
    }

    removeDiceByIndices(player, result.paidIndices);
    player.hand = player.hand.filter((_, i) => i !== cardIndex);

    if (card.category === 'event' || card.type === 'Event') {
        if (card.id === 'event_strategy' || card.name === '运筹帷幄') {
            GameMechanics.drawCards(player, 2);
        } else if (card.id === 'event_bestest' || card.name === '最好的伙伴!') {
            player.dice = [...player.dice, 'Omni', 'Omni'];
            capDice(player);
        } else if (card.id === 'food_lotus' || card.name === '莲花酥' || card.name === '\u83b2\u82b1\u9165') {
            activeChar.statuses = [...(activeChar.statuses || []), { name: 'Lotus Crisps', type: 'Shield', value: 3 }];
        }
    } else if (card.category === 'support' || card.type === 'Support') {
        GameMechanics.addSupport(player, card);
    } else {
        activeChar.equipment = [...(activeChar.equipment || []), card];
    }

    const isCombatAction = /战斗行动|戰鬥行動/.test(card.description || '');
    handleTurnSwitch(isCombatAction ? true : false);
});

globalBus.on('ACTION_USE_SKILL', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;
    if (pendingSwitch && pendingSwitch.playerId === 'p1') return;

    const player = gameState.players.p1;
    const opponent = gameState.players.p2;
    const attacker = player.characters[player.activeCharId];
    const target = opponent.characters[opponent.activeCharId];
    if (!attacker || !target) return;

    if ((attacker.statuses || []).some(s => s.name === 'Frozen')) {
        alert('Frozen: cannot use skills.');
        return;
    }

    const slot = data.slot || 'normal';
    const skillData = data.skillData || null;

    const dmg = parseSkillDamage(skillData, attacker);
    const skillInfo = {
        damage: {
            base: dmg.base || (slot === 'normal' ? 2 : 3),
            element: dmg.element || attacker.element,
            type: slot === 'burst' ? 'Burst' : (slot === 'skill' ? 'Skill' : 'Normal')
        }
    };

    const { diceCost, energyCost } = splitSkillCost(skillData, attacker, slot);

    if (slot === 'burst' && (attacker.energy || 0) < energyCost) {
        alert('Not enough energy.');
        return;
    }

    const costResult = CostValidator.check(player.dice, diceCost, attacker.element);
    if (!costResult.success) {
        alert('Not enough dice.');
        return;
    }

    removeDiceByIndices(player, costResult.paidIndices);

    if (slot === 'burst' && energyCost > 0) {
        attacker.energy = Math.max(0, (attacker.energy || 0) - energyCost);
    }

    resolveDamage('p1', 'p2', attacker, target, skillInfo);

    if (slot === 'normal' || slot === 'skill') {
        addEnergy(attacker, 1);
    }

    handleTurnSwitch(true);
});

globalBus.on('ACTION_SWITCH_CHAR', (data) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;
    if (pendingSwitch && pendingSwitch.playerId === 'p1') return;

    const player = gameState.players.p1;
    const targetCharId = data.targetId;
    const targetChar = player.characters[targetCharId];
    if (!targetChar || !targetChar.isAlive) return;
    if (player.activeCharId === targetCharId) return;

    if ((player.dice || []).length < 1) {
        alert('Need 1 die to switch.');
        return;
    }

    const newDice = [...player.dice];
    const idx = newDice.findIndex(d => d !== 'Omni');
    newDice.splice(idx >= 0 ? idx : 0, 1);
    player.dice = newDice;

    player.activeCharId = targetCharId;

    handleTurnSwitch(true);
});

globalBus.on('ACTION_TUNE_CARD', ({ cardId, dieIndex }) => {
    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;
    if (pendingSwitch && pendingSwitch.playerId === 'p1') return;

    const player = gameState.players.p1;
    const idx = player.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return;
    if (!player.dice || player.dice.length === 0) return;

    const activeChar = player.characters[player.activeCharId];
    player.hand = player.hand.filter((_, i) => i !== idx);

    const newDice = [...player.dice];
    const targetIdx = typeof dieIndex === 'number' && dieIndex >= 0 && dieIndex < newDice.length ? dieIndex : 0;
    newDice[targetIdx] = activeChar.element;
    player.dice = newDice;

    globalBus.emit('TUNE_COMPLETE');
    handleTurnSwitch(false);
});

globalBus.on('ACTION_END_ROUND', () => {
    if (gameFSM.currentPhase === PHASES.ROLL) {
        if (!rerollUsed.p2) {
            const ai = gameState.players.p2;
            const rerollCount = Math.min(3, Math.floor(Math.random() * 4));
            if (rerollCount > 0) {
                const indices = [];
                for (let i = 0; i < rerollCount && i < ai.dice.length; i++) indices.push(i);
                rerollDice(ai, indices);
            }
            rerollUsed.p2 = true;
        }
        gameFSM.transitionTo(PHASES.ACTION);
        return;
    }

    if (gameFSM.currentPhase !== PHASES.ACTION || gameState.activePlayerId !== 'p1') return;
    if (pendingSwitch && pendingSwitch.playerId === 'p1') return;

    gameState.players.p1.hasEndedRound = true;
    if (!gameState.players.p2.hasEndedRound) {
        gameState.players.p1.isFirst = true;
        gameState.players.p2.isFirst = false;
    }
    handleTurnSwitch(true);
});

// --- AI ---

globalBus.on('CMD_OPPONENT_ACT', () => {
    setTimeout(() => {
        if (gameFSM.currentPhase !== PHASES.ACTION) return;
        if (gameState.activePlayerId !== 'p2') return;

        const ai = gameState.players.p2;
        const player = gameState.players.p1;

        if (pendingSwitch && pendingSwitch.playerId === 'p2') {
            forceSwitch('p2', 'forced');
            pendingSwitch = null;
            return;
        }

        if (ai.hasEndedRound) return;

        const attacker = ai.characters[ai.activeCharId];
        const target = player.characters[player.activeCharId];
        if (!attacker || !target) return;

        if ((attacker.statuses || []).some(s => s.name === 'Frozen')) {
            ai.hasEndedRound = true;
            handleTurnSwitch(true);
            return;
        }

        if ((ai.dice || []).length >= 1) {
            // Simple AI: 1 die -> 2 damage normal attack
            ai.dice = ai.dice.slice(1);
            const skillInfo = { damage: { base: 2, element: attacker.element, type: 'Normal' } };
            resolveDamage('p2', 'p1', attacker, target, skillInfo);
            addEnergy(attacker, 1);
            handleTurnSwitch(true);
        } else {
            ai.hasEndedRound = true;
            if (!player.hasEndedRound) {
                ai.isFirst = true;
                player.isFirst = false;
            }
            handleTurnSwitch(true);
        }
    }, 600);
});

// --- End Phase ---

globalBus.on('CMD_END_PHASE_SETTLEMENT', () => {
    const firstPlayerId = gameState.players.p1.isFirst ? 'p1' : 'p2';
    const order = firstPlayerId === 'p1' ? ['p1', 'p2'] : ['p2', 'p1'];

    order.forEach(pid => processEndPhaseForPlayer(pid));

    GameMechanics.drawCards(gameState.players.p1, 2);
    GameMechanics.drawCards(gameState.players.p2, 2);

    gameState.roundNumber += 1;
    if (gameState.roundNumber >= 15) {
        globalBus.emit('GAME_OVER', { winner: 'draw' });
        gameFSM.transitionTo(PHASES.GAME_OVER);
        return;
    }

    setTimeout(() => {
        gameFSM.transitionTo(PHASES.ROLL);
    }, 800);
});

function processEndPhaseForPlayer(playerId) {
    const player = getPlayer(playerId);
    const opponent = getOpponent(playerId);

    // Summons
    const summons = [...(player.summons || [])];
    const remainingSummons = [];
    summons.forEach(summon => {
        if (summon.trigger === 'end' && summon.name === 'Burning Flame') {
            const attacker = player.characters[player.activeCharId] || getAliveCharacters(player)[0];
            const target = opponent.characters[opponent.activeCharId];
            if (attacker && target) {
                resolveDamage(playerId, opponent.id, attacker, target, { damage: { base: 1, element: 'Pyro', type: 'Summon' } });
            }
            summon.uses = (summon.uses || 1) - 1;
        }

        if (summon.uses > 0 || summon.duration > 0) {
            if (summon.duration) summon.duration -= 1;
            if ((summon.uses || 0) > 0 || (summon.duration || 0) > 0) {
                remainingSummons.push(summon);
            }
        }
    });
    player.summons = remainingSummons;

    // Character statuses duration
    Object.values(player.characters || {}).forEach(char => {
        if (!Array.isArray(char.statuses)) return;
        char.statuses = char.statuses
            .map(s => ({ ...s }))
            .filter(s => {
                if (typeof s.duration === 'number') {
                    s.duration -= 1;
                    return s.duration > 0;
                }
                return true;
            });
    });

    // Combat status duration
    if (Array.isArray(player.combatStatuses)) {
        player.combatStatuses = player.combatStatuses
            .map(s => ({ ...s }))
            .filter(s => {
                if (typeof s.duration === 'number') {
                    s.duration -= 1;
                    return s.duration > 0;
                }
                return true;
            });
    }
}

// --- Game Over ---

globalBus.on('GAME_OVER', () => {
    // View handles alerts
});
