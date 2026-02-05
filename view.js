// view.js
import { gameState } from './model.js';
import { globalBus } from './eventBus.js';

// --- 核心配置 ---
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

// 修正文件名乱码
const CARD_DATA_FILES = ['總覽 (1).csv', '總覽 (2).csv', '總覽 (3).csv'];
const cardImageMap = new Map();
const cardPageMap = new Map();
let cardDataLoaded = false;

const CHARACTER_DATA_FILE = 'role.json';
const characterDataMap = new Map();
let characterDataLoaded = false;
const actionCardPool = [];
const actionImageMap = new Map();



// 【新增】：行动牌数据源
const ACTION_DATA_FILES = ['equipment.json', 'support.json'];
const actionCardMap = new Map(); // 存储所有行动牌详情
let actionDataLoaded = false;


export function initView() {
    console.log("Initializing View (Genshin Style V3)...");
    
    renderHand();
    renderPlayerZone();
    renderOpponent();
    updateDiceCounters();

    // 加载所有数据
    Promise.all([
        loadCardData(),       // CSV 图片映射
        loadCharacterData(),  // 角色数据
        loadActionData()      // 行动牌数据
    ]).then(() => {
        renderSkillPanel();
        initDeckSelection();
                        initActiveSelect(); // 数据都齐了，启动选人流程
    }).catch(err => {
        console.error("Data load failed:", err);
    });

    const btnReroll = document.getElementById('btn-reroll');
    if (btnReroll) {
        btnReroll.addEventListener('click', () => {
            globalBus.emit('ACTION_REROLL_DICE');
        });
    }

    const btnTune = document.getElementById('btn-tune');
    if (btnTune) {
        btnTune.addEventListener('click', () => {
            toggleTuneMode();
        });
    }

    const btnEnd = document.getElementById('btn-end-turn');
    if (btnEnd) {
        btnEnd.addEventListener('click', () => {
            globalBus.emit('ACTION_END_ROUND');
        });
    }

    // 绑定技能按钮
    const btnNormal = document.querySelector('.skill-btn.normal-atk');
    if (btnNormal) {
        btnNormal.addEventListener('click', () => {
            globalBus.emit('ACTION_USE_SKILL', { skillId: btnNormal.dataset.skillId || 'normal', skillData: btnNormal._skillData || null });
        });
    }
    const btnSkill = document.querySelector('.skill-btn.elem-skill');
    if (btnSkill) {
        btnSkill.addEventListener('click', () => {
            globalBus.emit('ACTION_USE_SKILL', { skillId: btnSkill.dataset.skillId || 'skill', skillData: btnSkill._skillData || null });
        });
    }
    const btnBurst = document.querySelector('.skill-btn.elem-burst');
    if (btnBurst) {
        btnBurst.addEventListener('click', () => {
            globalBus.emit('ACTION_USE_SKILL', { skillId: btnBurst.dataset.skillId || 'burst', skillData: btnBurst._skillData || null });
        });
    }

    // 监听状态变化
    globalBus.on('STATE_CHANGED', (payload) => {
        if (payload.prop === 'hp') {
            updateHpBar(payload.target, payload.value);
            checkGameOver(payload.target);
        }
        if (payload.prop === 'dice') {
            renderDice(gameState.players.p1.dice); 
            updateDiceCounters();
        }
        if (payload.prop === 'hand') {
            renderHand(); 
        }
        if (payload.prop === 'phase') {
            updateTurnPointer(payload.value);
        }
        if (payload.prop === 'activePlayerId') {
            updateTurnPointer(gameState.phase);
        }
        if (payload.prop === 'elementAttachment') {
            updateElementAttachment(payload.target, payload.value);
        }
        if (payload.prop === 'activeCharId') {
            renderPlayerZone();
            renderOpponent();
            renderSkillPanel();
        }
    });
}

// 加载 CSV (主要用于图片映射)
async function loadCardData() {
    if (cardDataLoaded) return;
    try {
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
    } catch (e) {
        console.error("Error loading CSV:", e);
    }
}

// 加载角色 JSON
async function loadCharacterData() {
    if (characterDataLoaded) return;
    try {
        const res = await fetch(encodeURI(CHARACTER_DATA_FILE));
        const data = await res.json();
        
        data.forEach((item) => {
            if (item && item.card_type === 'Character' && item.name) {
                characterDataMap.set(item.name, item); 
            }
        });
        characterDataLoaded = true;
    } catch (e) {
        console.error("Error loading Character JSON:", e);
    }
}

// 【新增】：加载行动牌 JSON (装备、支援等)
async function loadActionData() {
    if (actionDataLoaded) return;
    try {
        const jsons = await Promise.all(
            ACTION_DATA_FILES.map(file => fetch(encodeURI(file)).then(res => res.json()))
        );
        
        jsons.forEach(dataList => {
            if (Array.isArray(dataList)) {
                dataList.forEach(item => {
                    // 确保是行动牌
                    if (item && item.name) {
                        actionCardMap.set(item.name, item);
                    }
                });
            }
        });
        actionDataLoaded = true;
        console.log(`Loaded ${actionCardMap.size} action cards.`);
    } catch (e) {
        console.error("Error loading Action JSON:", e);
    }
}

// --- 选人与选牌逻辑 ---

function initDeckSelection() {
    const overlay = document.getElementById('deck-select');
    const listEl = document.getElementById('deck-select-list');
    const startBtn = document.getElementById('btn-deck-start');
    const titleEl = overlay ? overlay.querySelector('.deck-select__title') : null;
    if (!overlay || !listEl || !startBtn) return;

    // 阶段一：选择角色
    const characters = getCharacterList();

    if (!characters.length) {
        if (titleEl) titleEl.textContent = '???????????????????';
        startBtn.disabled = true;
        return;
    }
    const selectedChars = new Set();

    const renderCharSelection = () => {
        if (titleEl) titleEl.textContent = `步骤 1/2: 选择出战角色 (${selectedChars.size}/3)`;
        listEl.innerHTML = '';
        listEl.className = 'deck-list-grid'; // 网格布局
        
        // 注入美化后的CSS样式
        if (!document.getElementById('deck-grid-style')) {
            const style = document.createElement('style');
            style.id = 'deck-grid-style';
            style.textContent = `
                /* 滚动容器优化 */
                #deck-select-list {
                    max-height: 60vh; /* 限制高度，超出显示滚动条 */
                    overflow-y: auto; 
                    padding: 15px;
                    scrollbar-width: thin;
                    scrollbar-color: #dcb67f #2a2a2a;
                    background: rgba(0, 0, 0, 0.2);
                    border-radius: 8px;
                    margin-bottom: 15px;
                }
                
                /* 滚动条美化 */
                #deck-select-list::-webkit-scrollbar {
                    width: 8px;
                }
                #deck-select-list::-webkit-scrollbar-track {
                    background: #2a2a2a; 
                    border-radius: 4px;
                }
                #deck-select-list::-webkit-scrollbar-thumb {
                    background-color: #dcb67f; 
                    border-radius: 4px; 
                }

                /* 网格布局 */
                .deck-list-grid { 
                    display: grid; 
                    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); 
                    gap: 15px; 
                }

                /* 卡牌通用样式 */
                .deck-card, .action-card-item { 
                    border: 2px solid #4a4a4a; 
                    border-radius: 10px; 
                    padding: 8px; 
                    cursor: pointer; 
                    text-align: center; 
                    position: relative;
                    background: #2a2a2a; 
                    transition: all 0.2s ease-out;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.3);
                    overflow: hidden;
                }

                /* 悬停效果 */
                .deck-card:hover, .action-card-item:hover { 
                    transform: translateY(-4px);
                    background: #333;
                    border-color: #888;
                    box-shadow: 0 8px 15px rgba(0,0,0,0.5);
                }

                /* 选中状态动画 */
                .deck-card.selected, .action-card-item.selected { 
                    border-color: #dcb67f !important; 
                    box-shadow: 0 0 15px rgba(220, 182, 127, 0.6);
                    background: rgba(220, 182, 127, 0.1);
                    animation: card-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                }

                /* 卡牌图片 */
                .deck-card__img, .action-card-item__img { 
                    width: 100%; 
                    height: 90px; 
                    background-size: cover; 
                    background-position: top center; 
                    margin-bottom: 8px; 
                    border-radius: 6px;
                    background-color: #111;
                }
                
                .deck-card__name, .action-card-name {
                    font-size: 12px;
                    color: #eee;
                    font-weight: bold;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                /* 数量角标动画 */
                .action-card-item .count-badge { 
                    position: absolute; 
                    top: 5px; 
                    right: 5px; 
                    background: linear-gradient(135deg, #ff4d4f, #d9363e); 
                    color: white; 
                    border: 2px solid white;
                    border-radius: 50%; 
                    width: 22px; 
                    height: 22px; 
                    font-size: 12px; 
                    line-height: 18px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.4);
                    animation: badge-pop 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    z-index: 10;
                }

                /* 关键帧动画 */
                @keyframes card-pop {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.08); }
                    100% { transform: scale(1); }
                }

                @keyframes badge-pop {
                    0% { transform: scale(0); opacity: 0; }
                    80% { transform: scale(1.2); opacity: 1; }
                    100% { transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
        }

        characters.forEach((c) => {
            const card = document.createElement('div');
            card.className = 'deck-card';
            if (selectedChars.has(c.name)) card.classList.add('selected');

            const imageUrl = resolveCardImageUrl(c.name);
            card.innerHTML = `
                <div class="deck-card__img" style="background-image: url('${imageUrl}')"></div>
                <div class="deck-card__name">${c.name}</div>
            `;

            card.onclick = () => {
                if (selectedChars.has(c.name)) {
                    selectedChars.delete(c.name);
                    card.classList.remove('selected');
                } else if (selectedChars.size < 3) {
                    selectedChars.add(c.name);
                    card.classList.add('selected');
                }
                if (titleEl) titleEl.textContent = `步骤 1/2: 选择出战角色 (${selectedChars.size}/3)`;
            };
            listEl.appendChild(card);
        });

        startBtn.textContent = "下一步：选择牌组";
        startBtn.onclick = () => {
            if (selectedChars.size !== 3) {
                alert("请必须选择 3 名角色！");
                return;
            }
            // 进入第二阶段
            initActionCardSelection(Array.from(selectedChars).map(name => characterDataMap.get(name)));
        };
    };

    renderCharSelection();
}

// 阶段二：选择 30 张行动牌
function initActionCardSelection(chosenCharacters) {
    const overlay = document.getElementById('deck-select');
    const listEl = document.getElementById('deck-select-list');
    const startBtn = document.getElementById('btn-deck-start');
    const titleEl = overlay ? overlay.querySelector('.deck-select__title') : null;

    // 牌组状态：name -> count
    const deckComposition = new Map(); 
    let totalCards = 0;
    const MAX_CARDS = 30;

    const allActions = Array.from(actionCardMap.values());

    const renderCardSelection = () => {
        if (titleEl) titleEl.textContent = `步骤 2/2: 构建牌组 (${totalCards}/${MAX_CARDS})`;
        listEl.innerHTML = '';
        listEl.className = 'deck-list-grid';

        // 渲染每一张可选的行动牌
        allActions.forEach(cardData => {
            const count = deckComposition.get(cardData.name) || 0;
            
            const item = document.createElement('div');
            item.className = 'action-card-item';
            // 使用 class 添加选中样式，触发动画
            if (count > 0) item.classList.add('selected');

            // 尝试获取图片：先查 CSV 映射，再查 JSON 里的 image 字段
            let imageUrl = resolveCardImageUrl(cardData.name);
            if (!imageUrl && cardData.image) imageUrl = cardData.image;

            item.innerHTML = `
                <div class="action-card-item__img" style="background-image: url('${imageUrl || ''}')"></div>
                <div class="action-card-name">${cardData.name}</div>
                ${count > 0 ? `<div class="count-badge">${count}</div>` : ''}
            `;

            // 点击逻辑：左键加，右键减（或者点击加，满了提示）
            item.onclick = (e) => {
                e.preventDefault();
                if (totalCards >= MAX_CARDS && count === 0) {
                    alert("牌组已满 30 张！");
                    return;
                }
                if (count >= 2) {
                    // 满了2张，询问是否减少
                    if (confirm(`是否从牌组移除一张 ${cardData.name}?`)) {
                        deckComposition.set(cardData.name, count - 1);
                        totalCards--;
                        renderCardSelection();
                    }
                    return;
                }
                
                deckComposition.set(cardData.name, count + 1);
                totalCards++;
                renderCardSelection();
            };
            
            // 添加右键减少的功能
            item.oncontextmenu = (e) => {
                e.preventDefault();
                if (count > 0) {
                    deckComposition.set(cardData.name, count - 1);
                    totalCards--;
                    renderCardSelection();
                }
            };

            listEl.appendChild(item);
        });

        startBtn.textContent = `开始游戏 (${totalCards}/30)`;
        startBtn.onclick = () => {
            if (totalCards !== MAX_CARDS) {
                if (!confirm(`牌组未满 30 张（当前 ${totalCards}），确定要开始吗？(不足部分将随机填充)`)) {
                    return;
                }
                // 自动填充逻辑 (可选)
                while(totalCards < MAX_CARDS) {
                    const randomCard = allActions[Math.floor(Math.random() * allActions.length)];
                    const c = deckComposition.get(randomCard.name) || 0;
                    if (c < 2) {
                        deckComposition.set(randomCard.name, c + 1);
                        totalCards++;
                    }
                }
            }

            // 构建最终牌组列表
            const finalDeck = [];
            deckComposition.forEach((count, name) => {
                const data = actionCardMap.get(name);
                for(let i=0; i<count; i++) {
                    finalDeck.push({
                        ...data, // 包含 cost, effect 等所有 JSON 数据
                        id: `card_${slugify(name)}_${i}` // 唯一ID
                    });
                }
            });

            // 初始化游戏
            setupPlayersFromSelection(chosenCharacters, finalDeck);
            
            overlay.classList.add('hidden');
            renderPlayerZone();
            renderOpponent();
            renderHand();
            renderSkillPanel();
            
            globalBus.emit('DECK_READY');
        };
    };

    renderCardSelection();
}

function setupPlayersFromSelection(chosenChars, playerDeck) {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    const allCharacters = getCharacterList();
    const remainingChars = allCharacters.filter(c => !chosenChars.some(chosen => chosen.name === c.name));

    // P1: 使用玩家选的角色和牌组
    const p1Chars = chosenChars.map(c => createCharacterFromJson(c));
    p1.characters = toCharacterMap(p1Chars);
    p1.deck = playerDeck; // 直接赋值玩家构建的牌组

    // P2 (AI): 随机角色，随机牌组
    const p2Chars = pickRandom(remainingChars, 3).map(c => createCharacterFromJson(c));
    p2.characters = toCharacterMap(p2Chars);
    
    // AI 牌组随机生成 30 张
    const allActions = Array.from(actionCardMap.values());
    const aiDeck = [];
    if (allActions.length > 0) {
        for(let i=0; i<30; i++) {
            const data = allActions[Math.floor(Math.random() * allActions.length)];
            aiDeck.push({ ...data, id: `ai_card_${i}` });
        }
    }
    p2.deck = aiDeck;

    // 默认首发
    p1.activeCharId = p1Chars[0]?.id || Object.keys(p1.characters)[0];
    p2.activeCharId = p2Chars[0]?.id || Object.keys(p2.characters)[0];

    p1.hasEndedRound = false;
    p2.hasEndedRound = false;
    p1.isFirst = true;
    p2.isFirst = false;

    p1.dice = [];
    p2.dice = [];

    p1.deck = buildActionDeck();
    p2.deck = buildActionDeck();
    p1.hand = [];
    p2.hand = [];

}

// --- 辅助函数 ---


function buildActionDeck() {
    const pool = actionCardPool.filter(c => c && c.name);
    const counts = new Map();
    const deck = [];
    while (deck.length < 30 && pool.length) {
        const idx = Math.floor(Math.random() * pool.length);
        const card = pool[idx];
        const count = counts.get(card.name) || 0;
        if (count < 2) {
            deck.push({ id: `${card.name}_${deck.length}`, name: card.name, type: card.sub_type || 'Event', cost: convertCost(card.cost) });
            counts.set(card.name, count + 1);
        }
    }
    return deck;
}

function convertCost(costArr) {
    if (!Array.isArray(costArr) || !costArr.length) return { count: 0, type: 'Unaligned' };
    const total = costArr.reduce((s, c) => s + (Number(c.count) || 0), 0);
    return { count: total, type: costArr[0].type || 'Unaligned' };
}

function getCharacterList() {
    const list = [];
    characterDataMap.forEach((data) => {
        list.push(data);
    });
    return list;
}

function createCharacterFromJson(data) {
    return {
        id: `char_${slugify(data.name)}`,
        name: data.name,
        hp: data.hp || data.HP || 10,
        maxHp: data.hp || data.HP || 10,
        element: data.element || data.Element || 'Physical',
        energy: 0,
        maxEnergy: data.maxEnergy || 3,
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


function initActiveSelect() {
    const panel = document.getElementById('active-select');
    const listEl = document.getElementById('active-select-list');
    const btn = document.getElementById('btn-active-confirm');
    if (!panel || !listEl || !btn) return;

    globalBus.on('SHOW_ACTIVE_SELECT', () => {
        listEl.innerHTML = '';
        panel.classList.remove('hidden');
        let selectedId = null;
        const chars = Object.values(gameState.players.p1.characters);

        chars.forEach(char => {
            const el = document.createElement('div');
            el.className = 'active-card';
            const img = document.createElement('div');
            img.className = 'active-card__img';
            const imgUrl = resolveCardImageUrl(char.name) || '';
            if (imgUrl) img.style.backgroundImage = `url("${imgUrl}")`;
            const name = document.createElement('div');
            name.className = 'active-card__name';
            name.textContent = char.name;
            el.appendChild(img);
            el.appendChild(name);
            el.addEventListener('click', () => {
                listEl.querySelectorAll('.active-card').forEach(n => n.classList.remove('selected'));
                el.classList.add('selected');
                selectedId = char.id;
            });
            listEl.appendChild(el);
        });

        btn.onclick = () => {
            if (!selectedId) return;
            panel.classList.add('hidden');
            globalBus.emit('CONFIRM_ACTIVE_SELECT', { targetId: selectedId });
        };
    });
}

function renderSkillPanel() {
    const p1Char = gameState.players.p1.characters[gameState.players.p1.activeCharId];
    if (!p1Char) return;
    
    const charData = characterDataMap.get(p1Char.name);
    const skills = charData ? (charData.skills || []) : [];
    
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
    btn._skillData = skill || null;

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
        btn.title = `${skill.name}\n${skill.description || ''}`.trim();
    }
}

function renderSkillList(skills) {
    const listEl = document.getElementById('skill-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!skills.length) {
        listEl.textContent = '暂无技能信息';
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
    const type = skill?.type || '';
    if (type === 'Normal Attack' || type.includes('Normal')) return '普通攻击';
    if (type === 'Elemental Skill' || type.includes('Skill')) return '元素战技';
    if (type === 'Elemental Burst' || type.includes('Burst')) return '元素爆发';
    
    const cost = calcSkillCost(skill);
    if (cost === 1) return '普通攻击';
    if (cost === 3) return '元素战技';
    if (cost >= 4) return '元素爆发';
    
    return '技能';
}

function classifySkill(skill) {
    const type = skill?.type || '';
    if (type.includes('Normal') || type.includes('普通攻击')) return 'normal';
    if (type.includes('Skill') || type.includes('元素战技')) return 'skill';
    if (type.includes('Burst') || type.includes('元素爆发')) return 'burst';
    
    const cost = calcSkillCost(skill);
    if (cost === 1) return 'normal';
    if (cost === 3) return 'skill';
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
        if (ch !== '\r') cell += ch;
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
    // 优先查 CSV 映射
    const pageUrl = cardPageMap.get(name);
    const imageUrl = cardImageMap.get(name);
    if (pageUrl && isImageUrl(pageUrl)) return pageUrl;
    if (imageUrl) return imageUrl;
    
    // 如果没有，查 actionCardMap (JSON 中的 image 字段)
    const jsonAction = actionCardMap.get(name);
    if (jsonAction && jsonAction.image) return jsonAction.image;

    // 再查角色 map
    const jsonChar = characterDataMap.get(name);
    if (jsonChar && jsonChar.image) return jsonChar.image;

    return '';
}

function updateDiceCounters() {
    const p1 = gameState.players.p1;
    const p2 = gameState.players.p2;

    const p1CountEl = document.getElementById('player-dice-count');
    if (p1CountEl) {
        const count = Array.isArray(p1.dice) ? p1.dice.length : 0;
        p1CountEl.textContent = count;
    }

    const p2CountEl = document.getElementById('opp-dice-count');
    if (p2CountEl && p2.dice !== undefined) {
        let count = 0;
        if (Array.isArray(p2.dice)) count = p2.dice.length;
        else if (typeof p2.dice === 'number') count = p2.dice;
        p2CountEl.textContent = count;
    }
}

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

// 【修复】：渲染对手区域（包含后台角色）
function renderOpponent() {
    const zone = document.getElementById('opponent-zone');
    if (!zone) return;
    zone.innerHTML = '';

    const p2 = gameState.players.p2;
    const chars = Object.values(p2.characters);
    chars.forEach((charData) => {
        const card = document.createElement('div');
        card.className = 'card character-card ' + (charData.id === p2.activeCharId ? 'active' : 'standby');
        card.dataset.id = charData.id;
        card.style.borderColor = '#99ffff';

        card.innerHTML = `
            <div class="card__visual" style="background: #a4b0be;"></div>
            <div class="card__info">
                <div class="card__name">${charData.name}</div>
                <div class="status-badges">
                    <div class="badge hp-badge">${charData.hp}</div>
                    <div class="badge energy-badge">${charData.energy}/${charData.maxEnergy}</div>
                </div>
            </div>
            <div class="card__hp-bar-container">
                <div class="card__hp-fill" style="width: ${(charData.hp/charData.maxHp)*100}%"></div>
            </div>
        `;
        zone.appendChild(card);

        const imageUrl = resolveCardImageUrl(charData.name);
        const visual = card.querySelector('.card__visual');
        if (visual && imageUrl) {
            visual.style.backgroundImage = `url("${imageUrl}")`;
            visual.style.backgroundSize = 'cover';
            visual.style.backgroundPosition = 'center';
        }
    });
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
        // 受击动画
        cardEl.style.transform = 'translateY(5px)';
        setTimeout(() => {
            cardEl.style.transform = '';
        }, 100);
    }
}

function updateElementAttachment(charState, element) {
    const cardEl = document.querySelector(`.card[data-id="${charState.id}"]`);
    if (!cardEl) return;
    
    let attachBadge = cardEl.querySelector('.element-attachment');
    if (!attachBadge) {
        attachBadge = document.createElement('div');
        attachBadge.className = 'badge element-attachment';
        attachBadge.style.position = 'absolute';
        attachBadge.style.top = '0';
        attachBadge.style.right = '0';
        attachBadge.style.width = '20px';
        attachBadge.style.height = '20px';
        attachBadge.style.borderRadius = '50%';
        attachBadge.style.border = '1px solid #fff';
        const infoBox = cardEl.querySelector('.card__info');
        if (infoBox) infoBox.appendChild(attachBadge);
    }

    if (element) {
        const config = ELEMENT_CONFIG[element];
        attachBadge.style.backgroundColor = config ? config.color : '#ccc';
        attachBadge.textContent = element.substring(0, 1); 
        attachBadge.style.display = 'flex';
        attachBadge.style.alignItems = 'center';
        attachBadge.style.justifyContent = 'center';
        attachBadge.style.fontSize = '12px';
        attachBadge.title = element;
    } else {
        attachBadge.style.display = 'none';
    }
}

// 【修复】：渲染整个玩家区域（出战+后台）
function renderPlayerZone() {
    const p1 = gameState.players.p1;
    const allChars = Object.values(p1.characters);
    const activeId = p1.activeCharId;
    
    // 获取DOM槽位
    const activeSlot = document.getElementById('active-char');
    const standbySlots = document.querySelectorAll('.player-zone .standby');
    
    // 1. 渲染出战角色
    const activeChar = p1.characters[activeId];
    if (activeChar && activeSlot) {
        updateCardVisual(activeSlot, activeChar);
    }
    
    // 2. 渲染后台角色 (过滤掉当前出战的)
    const standbyChars = allChars.filter(c => c.id !== activeId);
    
    standbySlots.forEach((slot, idx) => {
        const char = standbyChars[idx];
        if (char) {
            slot.dataset.empty = "false";
            updateCardVisual(slot, char);
            
            // 【新增】：点击后台角色时，触发切换事件
            slot.style.cursor = 'pointer';
            slot.onclick = () => {
               console.log("尝试切换到:", char.name);
               globalBus.emit('ACTION_SWITCH_CHAR', { targetId: char.id });
            };
        } else {
            slot.dataset.empty = "true";
            slot.innerHTML = '';
            slot.onclick = null;
            slot.style.cursor = 'default';
        }
    });
}

// 辅助函数：更新单张卡牌视觉
function updateCardVisual(cardEl, charData) {
    cardEl.dataset.id = charData.id;
    const imageUrl = resolveCardImageUrl(charData.name);
    
    cardEl.innerHTML = `
        <div class="card__visual" style="background-image: url('${imageUrl}'); background-size: cover; background-position: center;"></div>
        <div class="card__info">
            <div class="card__name">${charData.name}</div>
            <div class="status-badges">
                <div class="badge hp-badge">${charData.hp}</div>
                <div class="badge element-attachment" style="display:none"></div>
            </div>
        </div>
        <div class="card__hp-bar-container">
            <div class="card__hp-fill" style="width: ${(charData.hp/charData.maxHp)*100}%"></div>
        </div>
    `;
    
    if (charData.elementAttachment) {
        updateElementAttachment(charData, charData.elementAttachment);
    }
}

function renderDice(diceList) {
    const container = document.getElementById('dice-container');
    if (!container) return;
    container.innerHTML = '';
    
    const list = diceList || [];

    list.forEach(type => {
        const config = ELEMENT_CONFIG[type] || { color: '#cccccc', icon: '' };

        const wrapper = document.createElement('div');
        wrapper.className = 'dice-wrapper';
        wrapper.dataset.type = type;
        
        const textLayer = document.createElement('div');
        textLayer.className = 'dice-text-layer';
        textLayer.textContent = type.substring(0, 2).toUpperCase(); 
        textLayer.style.color = config.color;

        const img = document.createElement('img');
        img.className = 'dice-bg-layer';
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
        card.addEventListener('click', () => {
            if (tuneMode) {
                globalBus.emit('ACTION_TUNE_CARD', { cardId: cardData.id });
            }
        });
        handContainer.appendChild(card);
    });
}

let tuneMode = false;
let draggedEl = null;
let ghostEl = null;
let startX, startY;

function toggleTuneMode() {
    tuneMode = !tuneMode;
    document.body.classList.toggle('tune-mode', tuneMode);
}

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