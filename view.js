// view.js
import { gameState } from './model.js';
import { globalBus } from './eventBus.js';

// --- 核心配置：在这里定义各个元素的图标路径 ---
// 提示：你可以将 icon 的 URL 替换为你本地的图片路径，例如 './assets/pyro.png'
const ELEMENT_CONFIG = {
    'Cryo':   { color: '#99FFFF', icon: 'https://placehold.co/100/99FFFF/000?text=❄️' }, // 冰
    'Hydro':  { color: '#69C0FF', icon: 'https://placehold.co/100/69C0FF/000?text=💧' }, // 水
    'Pyro':   { color: '#FF7875', icon: 'https://placehold.co/100/FF7875/000?text=🔥' }, // 火
    'Electro':{ color: '#B37FEB', icon: 'https://placehold.co/100/B37FEB/000?text=⚡' }, // 雷
    'Anemo':  { color: '#95DE64', icon: 'https://placehold.co/100/95DE64/000?text=🍃' }, // 风
    'Geo':    { color: '#FFE58F', icon: 'https://placehold.co/100/FFE58F/000?text=🗿' }, // 岩
    'Dendro': { color: '#B7EB8F', icon: 'https://placehold.co/100/B7EB8F/000?text=🌿' }, // 草
    'Omni':   { color: '#FFFFFF', icon: 'https://placehold.co/100/FFFFFF/000?text=⚪' }  // 万能
};

const CARD_DATA_FILES = ['\u7e3d\u89bd (1).csv', '\u7e3d\u89bd (2).csv', '\u7e3d\u89bd (3).csv'];
const cardImageMap = new Map();
const cardPageMap = new Map();
let cardDataLoaded = false;
const CHARACTER_DATA_FILE = 'role.json';
const characterSkillMap = new Map();
let characterDataLoaded = false;


export function initView() {
    console.log("Initializing View (Genshin Style V3)...");
    
    renderHand();
    renderPlayerActiveChar();
    renderOpponent();
    updateDiceCounters();

    // 加载 CSV 卡牌数据 (page_url / image)，成功后重新渲染卡牌
    loadCardData()
        .then(() => {
            renderHand();
            renderPlayerActiveChar();
            renderOpponent();
        })
        .catch((err) => {
            console.warn("Card CSV load failed, fallback to text-only cards.", err);
        });

    loadCharacterData()
        .then(() => {
            renderSkillPanel();
            initDeckSelection();
        })
        .catch((err) => {
            console.warn("Character JSON load failed, skills panel will be empty.", err);
        }); // 初始化时更新一次计数

    const btnEnd = document.getElementById('btn-end-turn');
    if (btnEnd) {
        btnEnd.addEventListener('click', () => {
            globalBus.emit('ACTION_END_ROUND');
        });
    }

    const btnNormal = document.querySelector('.skill-btn.normal-atk');
    if (btnNormal) {
        btnNormal.addEventListener('click', () => {
            globalBus.emit('ACTION_USE_SKILL', { skillId: btnNormal.dataset.skillId || 'normal' });
        });
    }
    const btnSkill = document.querySelector('.skill-btn.elem-skill');
    if (btnSkill) {
        btnSkill.addEventListener('click', () => {
            globalBus.emit('ACTION_USE_SKILL', { skillId: btnSkill.dataset.skillId || 'skill' });
        });
    }
    const btnBurst = document.querySelector('.skill-btn.elem-burst');
    if (btnBurst) {
        btnBurst.addEventListener('click', () => {
            globalBus.emit('ACTION_USE_SKILL', { skillId: btnBurst.dataset.skillId || 'burst' });
        });
    }

    // 监听状态变化
    globalBus.on('STATE_CHANGED', (payload) => {
        // 血量更新
        if (payload.prop === 'hp') {
            updateHpBar(payload.target, payload.value);
            checkGameOver(payload.target);
        }
        // 骰子更新
        if (payload.prop === 'dice') {
            // 确保只渲染玩家自己的骰子池 (避免对手骰子变化干扰)
            renderDice(gameState.players.p1.dice); 
            // 同时更新两侧的数字计数
            updateDiceCounters();
        }
        // 手牌更新
        if (payload.prop === 'hand') {
            renderHand(); 
        }
        // 回合阶段变化 -> 更新指针方向
        if (payload.prop === 'phase') {
            updateTurnPointer(payload.value);
        }
        // 回合权变化 -> 更新指针
        if (payload.prop === 'activePlayerId') {
            updateTurnPointer(gameState.phase);
        }
    });
}

// ✅ 新增：更新双方骰子计数显示的函数


async function loadCardData() {
    if (cardDataLoaded) return;
    const csvTexts = await Promise.all(
        CARD_DATA_FILES.map((file) => fetch(encodeURI(file)).then((res) => res.text()))
    );
    csvTexts.forEach((csvText) => {
        const rows = parseCsv(csvText);
        if (!rows.length) return;

        const header = rows[0].map((h) => (h || '').trim());
        const idxText = header.indexOf('text');
        const idxImage = header.indexOf('image');
        const idxPng = header.indexOf('png_url');
        const idxPage = header.indexOf('image');

        rows.forEach((row, index) => {
            if (index === 0) return;
            const name = (row[idxText] || row[0] || '').trim();
            const image = (row[idxPng] || row[idxImage] || '').trim();
            const pageUrl = (row[idxPage] || row[2] || '').trim();
            if (!name) return;
            if (image) cardImageMap.set(name, image);
            if (pageUrl) cardPageMap.set(name, pageUrl);
        });
    });
    cardDataLoaded = true;
}


async function loadCharacterData() {
    if (characterDataLoaded) return;
    const res = await fetch(encodeURI(CHARACTER_DATA_FILE));
    const data = await res.json();
    data.forEach((item) => {
        if (item && item.card_type === 'Character' && item.name) {
            characterSkillMap.set(item.name, item.skills || []);
        }
    });
    characterDataLoaded = true;
}


function initDeckSelection() {
    const overlay = document.getElementById('deck-select');
    const listEl = document.getElementById('deck-select-list');
    const startBtn = document.getElementById('btn-deck-start');
    const titleEl = overlay ? overlay.querySelector('.deck-select__title') : null;
    if (!overlay || !listEl || !startBtn) return;

    const characters = getCharacterList();
    const selected = new Set();

    const updateTitle = () => {
        if (titleEl) titleEl.textContent = `??????(${selected.size}/3)`;
    };

    listEl.innerHTML = '';
    characters.forEach((c) => {
        const card = document.createElement('div');
        card.className = 'deck-card';
        card.dataset.name = c.name;

        const img = document.createElement('div');
        img.className = 'deck-card__img';
        const imageUrl = resolveCardImageUrl(c.name) || '';
        if (imageUrl) img.style.backgroundImage = `url("${imageUrl}")`;

        const name = document.createElement('div');
        name.className = 'deck-card__name';
        name.textContent = c.name;

        card.appendChild(img);
        card.appendChild(name);

        card.addEventListener('click', () => {
            if (selected.has(c.name)) {
                selected.delete(c.name);
                card.classList.remove('selected');
            } else if (selected.size < 3) {
                selected.add(c.name);
                card.classList.add('selected');
            }
            updateTitle();
        });

        listEl.appendChild(card);
    });

    updateTitle();

    startBtn.addEventListener('click', () => {
        if (selected.size !== 3) return;
        const chosen = characters.filter(c => selected.has(c.name));
        setupPlayersFromSelection(chosen, characters);
        overlay.classList.add('hidden');
        renderPlayerActiveChar();
        renderOpponent();
        renderHand();
        renderSkillPanel();
            initDeckSelection();
        globalBus.emit('DECK_READY');
    });
}

function setupPlayersFromSelection(chosen, allCharacters) {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    const chosenNames = new Set(chosen.map(c => c.name));
    const remaining = allCharacters.filter(c => !chosenNames.has(c.name));

    const p1Chars = chosen.slice(0, 3).map(c => createCharacterFromJson(c));
    const p2Chars = pickRandom(remaining, 3).map(c => createCharacterFromJson(c));

    p1.characters = toCharacterMap(p1Chars);
    p2.characters = toCharacterMap(p2Chars);

    p1.activeCharId = p1Chars[0]?.id || Object.keys(p1.characters)[0];
    p2.activeCharId = p2Chars[0]?.id || Object.keys(p2.characters)[0];

    p1.hasEndedRound = false;
    p2.hasEndedRound = false;
    p1.isFirst = true;
    p2.isFirst = false;

    p1.dice = [];
    p2.dice = [];
}

function getCharacterList() {
    const list = [];
    characterSkillMap.forEach((skills, name) => {
        list.push({ name, skills });
    });
    return list;
}

function createCharacterFromJson(data) {
    return {
        id: `char_${slugify(data.name)}`,
        name: data.name,
        hp: data.hp || 10,
        maxHp: data.hp || 10,
        element: data.element || 'Physical',
        energy: 0,
        maxEnergy: 3,
        isAlive: true,
        statuses: [],
        equipment: [],
        elementAttachment: null
    };
}

function toCharacterMap(chars) {
    const map = {};
    chars.forEach(c => { map[c.id] = c; });
    return map;
}

function pickRandom(arr, count) {
    const pool = [...arr];
    const out = [];
    while (pool.length && out.length < count) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
    }
    return out;
}

function slugify(name) {
    return name
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_一-龥]/g, '');
}

function renderSkillPanel() {
    const p1Char = gameState.players.p1.characters[gameState.players.p1.activeCharId];
    if (!p1Char) return;
    const skills = characterSkillMap.get(p1Char.name) || [];
    renderSkillButtons(skills);
    renderSkillList(skills);
}

function renderSkillButtons(skills) {
    const normalBtn = document.querySelector('.skill-btn.normal-atk');
    const skillBtn = document.querySelector('.skill-btn.elem-skill');
    const burstBtn = document.querySelector('.skill-btn.elem-burst');

    const slots = { normal: null, skill: null, burst: null };
    skills.forEach((s) => {
        const type = classifySkill(s);
        if (type && !slots[type]) slots[type] = s;
    });

    // Fallback by index if types missing
    if (!slots.normal && skills[0]) slots.normal = skills[0];
    if (!slots.skill && skills[1]) slots.skill = skills[1];
    if (!slots.burst && skills[2]) slots.burst = skills[2];

    applySkillToButton(normalBtn, slots.normal, 'A');
    applySkillToButton(skillBtn, slots.skill, 'E');
    applySkillToButton(burstBtn, slots.burst, 'Q');
}

function applySkillToButton(btn, skill, fallbackLabel) {
    if (!btn) return;
    const iconEl = btn.querySelector('.skill-icon');
    const badgeEl = btn.querySelector('.skill-cost-badge');

    btn.dataset.skillId = skill ? (skill.name || '') : '';

    if (iconEl) {
        iconEl.innerHTML = '';
        if (skill && skill.icon) {
            const img = document.createElement('img');
            img.src = skill.icon;
            img.alt = skill.name || '';
            img.className = 'skill-icon__img';
            iconEl.appendChild(img);
        } else {
            iconEl.textContent = fallbackLabel;
        }
    }

    if (badgeEl) {
        const cost = skill ? calcSkillCost(skill) : '';
        badgeEl.textContent = cost !== null ? String(cost) : '';
    }

    if (skill) {
        btn.title = `${skill.name}
${skill.description || ''}`.trim();
    }
}

function renderSkillList(skills) {
    const listEl = document.getElementById('skill-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!skills.length) {
        listEl.textContent = '??????';
        return;
    }

    skills.forEach((skill) => {
        const item = document.createElement('div');
        item.className = 'skill-item';

        const icon = document.createElement('img');
        icon.className = 'skill-item__icon';
        icon.src = skill.icon || '';
        icon.alt = skill.name || '';

        const info = document.createElement('div');
        info.className = 'skill-item__info';

        const title = document.createElement('div');
        title.className = 'skill-item__name';
        title.textContent = skill.name || '';

        const type = document.createElement('div');
        type.className = 'skill-item__type';
        type.textContent = getSkillTypeLabel(skill);

        const desc = document.createElement('div');
        desc.className = 'skill-item__desc';
        desc.textContent = (skill.description || '').replace(/\s+\d+\s*$/g, '').trim();

        info.appendChild(title);
        info.appendChild(type);
        info.appendChild(desc);

        item.appendChild(icon);
        item.appendChild(info);

        listEl.appendChild(item);
    });
}

function getSkillTypeLabel(skill) {
    const desc = skill?.description || '';
    if (desc.includes('????')) return '????';
    if (desc.includes('????')) return '????';
    if (desc.includes('????')) return '????';
    return skill?.type || '??';
}

function classifySkill(skill) {
    const desc = skill?.description || '';
    if (desc.includes('????')) return 'normal';
    if (desc.includes('????')) return 'skill';
    if (desc.includes('????')) return 'burst';
    return null;
}

function calcSkillCost(skill) {
    if (!skill || !Array.isArray(skill.cost)) return null;
    return skill.cost.reduce((sum, c) => sum + (Number(c.count) || 0), 0);
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];

        if (ch === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (!inQuotes && (ch === ',' || ch === '\n')) {
            row.push(cell);
            cell = '';
            if (ch === '\n') {
                rows.push(row);
                row = [];
            }
            continue;
        }

        if (ch !== '\r') {
            cell += ch;
        }
    }

    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

function isImageUrl(url) {
    return /\.(png|jpg|jpeg|webp|gif)(\?.*)?$/i.test(url);
}

function resolveCardImageUrl(name) {
    const pageUrl = cardPageMap.get(name);
    const imageUrl = cardImageMap.get(name);
    if (pageUrl && isImageUrl(pageUrl)) return pageUrl;
    return imageUrl || '';
}

function updateDiceCounters() {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    // 更新玩家计数
    const p1CountEl = document.getElementById('player-dice-count');
    if (p1CountEl) {
        const count = Array.isArray(p1.dice) ? p1.dice.length : 0;
        p1CountEl.textContent = count;
    }

    // 更新对手计数 (支持数组或数字模式)
    const p2CountEl = document.getElementById('opp-dice-count');
    // 只有当 p2.dice 有数据时才更新，否则保持 HTML 默认值
    if (p2CountEl && p2.dice !== undefined) {
        let count = 0;
        if (Array.isArray(p2.dice)) {
            count = p2.dice.length;
        } else if (typeof p2.dice === 'number') {
            count = p2.dice;
        }
        p2CountEl.textContent = count;
    }
}

// 更新回合指针方向
function updateTurnPointer(phase) {
    const pointer = document.getElementById('turn-pointer');
    const phaseText = document.getElementById('phase-text');
    
    if (!pointer) return;

    const isMyTurn = (phase === 'PHASE_ACTION' && gameState.activePlayerId === 'p1') || phase === 'PHASE_ROLL';
    const isOpponentTurn = (phase === 'PHASE_ACTION' && gameState.activePlayerId === 'p2');

    if (isOpponentTurn) {
        pointer.classList.remove('turn-p1');
        pointer.classList.add('turn-p2');
        if (phaseText) phaseText.textContent = "对手回合";
    } 
    else if (isMyTurn) {
        pointer.classList.add('turn-p1');
        pointer.classList.remove('turn-p2');
        if (phaseText) phaseText.textContent = "我的回合";
    }
}

function checkGameOver(targetChar) {
    if (targetChar.hp <= 0) {
        setTimeout(() => {
            const isOpponent = Boolean(gameState.players.p2.characters[targetChar.id]);
            alert(isOpponent ? "胜利！" : "失败！");
            globalBus.emit('GAME_OVER');
        }, 300);
    }
}

function renderOpponent() {
    const zone = document.getElementById('opponent-zone');
    if (!zone) return;
    zone.innerHTML = ''; 

    const p2 = gameState.players.p2;
    const charData = p2.characters[p2.activeCharId];
    const imageUrl = resolveCardImageUrl(charData.name);

    const card = document.createElement('div');
    card.className = 'card character-card active';
    card.dataset.id = charData.id; 
    card.style.borderColor = '#99ffff';

    card.innerHTML = `
        <div class="card__visual" style="background: #a4b0be;"></div>
        <div class="card__info">
            <div class="card__name">${charData.name}</div>
            <div class="status-badges">
                <div class="badge hp-badge">${charData.hp}</div>
                <div class="badge">❄️</div>
            </div>
        </div>
        <div class="card__hp-bar-container">
            <div class="card__hp-fill" style="width: ${(charData.hp/charData.maxHp)*100}%"></div>
        </div>
    `;
    zone.appendChild(card);

    const visual = card.querySelector('.card__visual');
    if (visual && imageUrl) {
        visual.style.backgroundImage = `url("${imageUrl}")`;
        visual.style.backgroundSize = 'cover';
        visual.style.backgroundPosition = 'center';
    }
}

function updateHpBar(charState, newHp) {
    const cardEl = document.querySelector(`.card[data-id="${charState.id}"]`);
    if (cardEl) {
        const hpFill = cardEl.querySelector('.card__hp-fill');
        if (hpFill) {
            const percent = (newHp / charState.maxHp) * 100;
            hpFill.style.width = `${percent}%`;
        }
        const hpBadge = cardEl.querySelector('.hp-badge');
        if (hpBadge) {
            hpBadge.textContent = newHp;
        }
        cardEl.style.transform = 'translateY(5px)';
        setTimeout(() => {
            cardEl.style.transform = '';
        }, 100);
    }
}

function renderPlayerActiveChar() {
    const p1 = gameState.players.p1;
    const p1Char = p1.characters[p1.activeCharId];
    const el = document.getElementById('active-char');
    if (el && p1Char) {
        el.dataset.id = p1Char.id;
        el.querySelector('.card__name').textContent = p1Char.name;
        const visual = el.querySelector('.card__visual');
        const imageUrl = resolveCardImageUrl(p1Char.name);
        if (visual && imageUrl) {
            visual.style.backgroundImage = `url("${imageUrl}")`;
            visual.style.backgroundSize = 'cover';
            visual.style.backgroundPosition = 'center';
        }
        updateHpBar(p1Char, p1Char.hp);
    }
}

function renderDice(diceList) {
    const container = document.getElementById('dice-container');
    if (!container) return;
    container.innerHTML = '';
    
    // 如果传入的 diceList 为空或 undefined，给个默认空数组
    const list = diceList || [];

    list.forEach(type => {
        // 1. 获取该元素类型的配置信息
        const config = ELEMENT_CONFIG[type] || { color: '#cccccc', icon: '' };

        // 2. 创建容器
        const wrapper = document.createElement('div');
        wrapper.className = 'dice-wrapper';
        wrapper.dataset.type = type;
        
        // 3. 创建文字层 (位于底部，作为一种备用的背景文字)
        const textLayer = document.createElement('div');
        textLayer.className = 'dice-text-layer';
        // 显示前两个字母，并使用该元素的代表色
        textLayer.textContent = type.substring(0, 2).toUpperCase(); 
        textLayer.style.color = config.color;

        // 4. 创建图片层 (覆盖在上面)
        const img = document.createElement('img');
        img.className = 'dice-bg-layer';
        // 使用配置中的 icon URL
        img.src = config.icon; 
        img.alt = type;
        
        wrapper.appendChild(textLayer);
        wrapper.appendChild(img);
        
        container.appendChild(wrapper);
    });
}

function renderHand() {
    const handContainer = document.getElementById('hand-area');
    if (!handContainer) return;
    handContainer.innerHTML = ''; 
    gameState.players.p1.hand.forEach(cardData => {
        const card = document.createElement('div');
        card.className = 'card';
        const imageUrl = resolveCardImageUrl(cardData.name);
        const pageUrl = cardPageMap.get(cardData.name);
        card.dataset.pageUrl = pageUrl || '';
        card.innerHTML = `
            <div class="hand-card__image" style="background-image: url('${imageUrl}')"></div>
            <div class="hand-card__label">${cardData.name}</div>
        `;
        card.dataset.id = cardData.id;
        card.addEventListener('mousedown', handleDragStart);
        handContainer.appendChild(card);
    });
}

let draggedEl = null;
let ghostEl = null;
let startX, startY;

function handleDragStart(e) {
    const cardEl = e.target.closest('.card');
    if (!cardEl) return;
    draggedEl = cardEl;
    const rect = draggedEl.getBoundingClientRect();
    ghostEl = draggedEl.cloneNode(true);
    ghostEl.classList.add('drag-ghost');
    ghostEl.style.width = `${rect.width}px`;
    ghostEl.style.left = `${rect.left}px`;
    ghostEl.style.top = `${rect.top}px`;
    document.body.appendChild(ghostEl);
    draggedEl.classList.add('card--dragging');
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;
    ghostEl.style.left = `${rect.left}px`;
    ghostEl.style.top = `${rect.top}px`;
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
}

function handleDragMove(e) {
    if (!ghostEl) return;
    ghostEl.style.left = `${e.clientX - startX}px`;
    ghostEl.style.top = `${e.clientY - startY}px`;
}

function handleDragEnd(e) {
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    if (draggedEl) draggedEl.classList.remove('card--dragging');
    if (ghostEl) { ghostEl.remove(); ghostEl = null; }
    const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
    if (!elementBelow) return;
    const battlefield = elementBelow.closest('.battle-field');
    if (battlefield) {
        globalBus.emit('ACTION_PLAY_CARD', { cardId: draggedEl.dataset.id });
    }
    draggedEl = null;
}   
