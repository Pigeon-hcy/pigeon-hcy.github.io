import { binderSections, cards } from "./cards.js?v=graphic-20260927-8";
import { attachCardShader } from "./shader.js?v=graphic-20260927-8";
import {
  startFoilCanvas,
  attachPaintShader,
  paintArt,
  binderPlate,
} from "./graphic-shader.js?v=graphic-20260927-8";
import { cardArtSvg, mountStaticArt, GRAPHIC_INKS, GRAPHIC_LAYOUTS, paintSeed } from "./art.js?v=graphic-20260927-8";
import { startOpening } from "./opening.js?v=graphic-20260927-8";

const editionByTier = { uncommon: "foil", rare: "holo", mythic: "polychrome" };
const THEME_STORAGE_KEY = "portfolio-theme-mode";
const LANGUAGE_STORAGE_KEY = "portfolio-language";
const themeModes = ["system", "dark", "light"];
const languages = ["en", "zh"];
const restTilts = ["-1.2deg", "0.8deg", "-0.6deg", "1deg"];
const sectionColors = ["var(--mint)", "var(--hot)", "var(--gold)", "var(--violet)", "var(--cyan)"];

// Text that is generated in JS. Static page text lives in index.html
// (English as the element text, Chinese in its data-zh attribute).
const uiText = {
  en: {
    theme: { system: "System", dark: "Dark", light: "Light" },
    themeAria: (label) => `Color theme: ${label}. Click to change.`,
    languageAria: "Language: English. Switch to Chinese.",
    profileAria: "Flip Chengyu Huang's profile card",
    profileFlippedAria: "Chengyu Huang's profile card",
    readCase: "Read case study",
    caseSoon: "Case study coming soon",
    playItch: "Play on itch.io",
    viewSteam: "View on Steam",
    openLink: "Open link",
    pageAria: (page, total) => `Page ${page} of ${total}`,
  },
  zh: {
    documentTitle: "CY 的主页",
    theme: { system: "跟随系统", dark: "深色", light: "浅色" },
    themeAria: (label) => `配色：${label}。点击切换。`,
    languageAria: "语言：中文。切换到英文。",
    profileAria: "翻开 Chengyu Huang 的角色卡",
    profileFlippedAria: "Chengyu Huang 的角色卡",
    readCase: "阅读案例",
    caseSoon: "案例整理中",
    playItch: "在 itch.io 试玩",
    viewSteam: "在 Steam 查看",
    openLink: "打开链接",
    pageAria: (page, total) => `第 ${page} 页，共 ${total} 页`,
  },
};

let cardShaders = [];
let detailReturnTarget = null;
let detailCardId = null;
let isClosingDetail = false;
let binderResizeTimer = 0;
let swipeSuppressUntil = 0;

function getBinderViewportLayout() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  if (width <= 560) {
    return { cardsPerPage: 2, columns: height >= 700 ? 1 : 2 };
  }
  if (width <= 900 && height > width * 1.1) {
    return { cardsPerPage: 4, columns: 2 };
  }
  return { cardsPerPage: 3, columns: 3 };
}

let binderViewportLayout = getBinderViewportLayout();

function disposeCardShaders() {
  cardShaders.forEach((shader) => shader.dispose());
  cardShaders = [];
}

const state = {
  stage: "sealed",
  sectionIndex: Math.max(0, binderSections.findIndex((section) => section.id === "featured")),
  pageIndex: 0,
  autoBinderTimer: 0,
  autoBinderPending: false,
  profileDockTimer: 0,
};

const root = document.documentElement;
const stage = document.querySelector(".pack-stage");
const stageFocus = document.querySelector("#stageFocus");
const packZone = document.querySelector("#packZone");
const binderStage = document.querySelector("#binderStage");
const tearButton = document.querySelector("#tearButton");
const tearHandle = document.querySelector("#tearHandle");
const openBinderButton = document.querySelector("#openBinderButton");
const binderTabs = document.querySelector("#binderTabs");
const binderPage = document.querySelector("#binderPage");
const sectionNumber = document.querySelector("#sectionNumber");
const sectionTitle = document.querySelector("#sectionTitle");
const sectionDescription = document.querySelector("#sectionDescription");
const prevSection = document.querySelector("#prevSection");
const nextSection = document.querySelector("#nextSection");
const pageIndicator = document.querySelector("#pageIndicator");
const dialog = document.querySelector("#cardDialog");
const dialogCard = document.querySelector("#dialogCard");
const closeDialog = document.querySelector("#closeDialog");
const profileCard = document.querySelector("#profileCard");
const flipParticles = profileCard.querySelector(".flip-particles");
const themeToggle = document.querySelector("#themeToggle");
const themeText = themeToggle.querySelector(".theme-toggle-text");
const langToggle = document.querySelector("#langToggle");
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: light)");
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

// Backgrounds switch behind a full-screen ink band (see graphic-shader.js).
const backgroundShader = startFoilCanvas(document.querySelector("#foil-canvas"), {
  band: document.querySelector(".wipe-band"),
});
const packShader = attachPaintShader(document.querySelector(".pack-foil-shader"), {
  layout: GRAPHIC_LAYOUTS.pack,
  seed: paintSeed("core-2026"),
  palette: GRAPHIC_INKS.pack,
});
let wipeBusy = false;
if (!packShader) document.querySelector(".pack").classList.add("is-unpainted");

const tearDrag = {
  active: false,
  moved: false,
  startX: 0,
  progress: 0,
  threshold: 0,
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const easeInOut = (value) => value * value * (3 - 2 * value);
const isThemeMode = (value) => themeModes.includes(value);
const isLanguage = (value) => languages.includes(value);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function readStored(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // localStorage can be unavailable in some embedded browsers.
  }
}

function readThemeMode() {
  const saved = readStored(THEME_STORAGE_KEY);
  return isThemeMode(saved) ? saved : "system";
}

function readLanguage() {
  const saved = readStored(LANGUAGE_STORAGE_KEY);
  if (isLanguage(saved)) return saved;
  const preferred = navigator.languages?.[0] ?? navigator.language ?? "";
  return /^zh\b/i.test(preferred) ? "zh" : "en";
}

let themeMode = readThemeMode();
let language = readLanguage();
const text = () => uiText[language];
uiText.en.documentTitle = document.title;

function localize(item) {
  return language === "zh" && item.zh ? { ...item, ...item.zh } : item;
}

function getResolvedTheme() {
  if (themeMode !== "system") return themeMode;
  return systemThemeQuery.matches ? "light" : "dark";
}

function updateThemeLabel() {
  const label = text().theme[themeMode];
  themeText.textContent = label;
  themeToggle.setAttribute("aria-label", text().themeAria(label));
  themeToggle.setAttribute("aria-pressed", themeMode !== "system" ? "true" : "false");
}

function applyTheme() {
  const resolvedTheme = getResolvedTheme();
  root.dataset.themeMode = themeMode;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
  backgroundShader.setTheme(resolvedTheme);
  updateThemeLabel();
}

function cycleThemeMode() {
  const nextIndex = (themeModes.indexOf(themeMode) + 1) % themeModes.length;
  themeMode = themeModes[nextIndex];
  writeStored(THEME_STORAGE_KEY, themeMode === "system" ? null : themeMode);
  applyTheme();
}

function translateStaticText() {
  document.querySelectorAll("[data-zh]").forEach((element) => {
    if (element.dataset.en === undefined) element.dataset.en = element.textContent;
    element.textContent = language === "zh" ? element.dataset.zh : element.dataset.en;
  });
  document.querySelectorAll("[data-zh-aria-label]").forEach((element) => {
    if (element.dataset.enAriaLabel === undefined) element.dataset.enAriaLabel = element.getAttribute("aria-label") ?? "";
    element.setAttribute("aria-label", language === "zh" ? element.dataset.zhAriaLabel : element.dataset.enAriaLabel);
  });
}

function updateProfileAria() {
  const flipped = profileCard.dataset.flipped === "true";
  profileCard.setAttribute("aria-label", flipped ? text().profileFlippedAria : text().profileAria);
}

function applyLanguage({ rerender = true } = {}) {
  root.lang = language === "zh" ? "zh-CN" : "en";
  root.dataset.lang = language;
  document.title = text().documentTitle;
  translateStaticText();
  langToggle.setAttribute("aria-label", text().languageAria);
  langToggle.querySelectorAll("[data-lang-option]").forEach((option) => {
    option.classList.toggle("is-active", option.dataset.langOption === language);
  });
  updateThemeLabel();
  updateProfileAria();
  if (!rerender) return;
  renderTabs();
  renderSection(state.sectionIndex, state.pageIndex, { quiet: true });
  if (dialog.open && detailCardId) {
    const card = cards.find((item) => item.id === detailCardId);
    if (card) {
      dialogCard.innerHTML = renderDetail(card);
      paintVisibleCardArt(dialogCard);
    }
  }
}

function toggleLanguage() {
  language = language === "zh" ? "en" : "zh";
  writeStored(LANGUAGE_STORAGE_KEY, language);
  root.classList.remove("is-switching-language");
  void root.offsetWidth;
  root.classList.add("is-switching-language");
  window.setTimeout(() => root.classList.remove("is-switching-language"), 700);
  applyLanguage();
}

const profileHover = {
  swayRange: 4,
  swaySpeed: 0.8,
  pressRange: 6,
  yawRange: 5,
  scaleMultiplier: 1.15,
  scaleDuration: 260,
  scale: 1,
  scaleFrom: 1,
  scaleTo: 1,
  scaleStart: 0,
  scaling: false,
  mouseOver: false,
  pointerX: 0.5,
  pointerY: 0.5,
  clientX: Number.NaN,
  clientY: Number.NaN,
};

const isSmallScreen = () => window.matchMedia("(max-width: 760px)").matches;

function setStage(nextStage) {
  state.stage = nextStage;
  stage.dataset.stage = nextStage;
  if (!document.body.classList.contains("binder-open")) {
    backgroundShader.setMood(nextStage === "pack-exit" || nextStage === "revealed" ? "revealed" : "sealed");
  }
}

function paintSize(canvas, scale = 1) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2) * scale;
  canvas.width = Math.max(64, Math.round(canvas.clientWidth * ratio));
  canvas.height = Math.max(64, Math.round(canvas.clientHeight * ratio));
}

// Printed plates for the profile card faces (rendered once, then kept).
function paintProfileFaces() {
  document.querySelectorAll("canvas[data-paint]").forEach((canvas) => {
    const key = canvas.dataset.paint;
    paintSize(canvas);
    const painted = paintArt(canvas, {
      layout: GRAPHIC_LAYOUTS[key],
      seed: paintSeed(key),
      palette: GRAPHIC_INKS[key],
    });
    canvas.parentElement.classList.toggle("is-unpainted", !painted);
  });
}

function paintCardArt(canvas, card, scale = 1) {
  paintSize(canvas, scale);
  const painted = paintArt(canvas, {
    layout: cards.indexOf(card) % 5,
    seed: paintSeed(card.id),
    palette: GRAPHIC_INKS[card.accent] ?? GRAPHIC_INKS.blue,
  });
  // Without WebGL the flat SVG poster stands in for the painting.
  if (!painted) canvas.outerHTML = cardArtSvg(card, { uid: canvas.dataset.uid ?? "", index: cards.indexOf(card) });
}

function paintVisibleCardArt(root) {
  root.querySelectorAll("canvas[data-card-art]").forEach((canvas) => {
    const card = cards.find((item) => item.id === canvas.dataset.cardArt);
    if (card) paintCardArt(canvas, card);
  });
}

// The plate's subject is centred on the pack (and later the card). In the
// binder the plates stand behind the sleeves, so they frame the card area.
function syncShaderFocus(immediate = false) {
  if (document.body.classList.contains("binder-open")) {
    const area = document.querySelector(".binder-page-wrap").getBoundingClientRect();
    backgroundShader.setFocus(area.left + area.width / 2, area.top + area.height * 0.58, area.height, immediate);
    backgroundShader.setCalm(0.35);
    return;
  }

  const focusBounds = stageFocus.getBoundingClientRect();
  backgroundShader.setFocus(
    focusBounds.left + focusBounds.width / 2,
    focusBounds.top + focusBounds.height / 2,
    packZone.offsetHeight,
    immediate,
  );
  backgroundShader.setCalm(state.stage === "revealed" ? 0.12 : 0);
}

function setTearProgress(progress) {
  tearDrag.progress = clamp(progress, 0, 1);
  stage.style.setProperty("--tear-progress", tearDrag.progress.toFixed(3));
}

function setPackTilt(event) {
  if (state.stage !== "sealed" || tearDrag.active) return;
  stage.classList.add("is-pack-hovered");
  const bounds = packZone.getBoundingClientRect();
  const tx = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) - 0.5;
  const ty = clamp((event.clientY - bounds.top) / bounds.height, 0, 1) - 0.5;
  stage.style.setProperty("--pack-tilt-x", `${(-ty * 7).toFixed(2)}deg`);
  stage.style.setProperty("--pack-tilt-y", `${(tx * 9).toFixed(2)}deg`);
  packShader?.setPointer(0.5 + tx * 0.3, 0.5 + ty * 0.3);
}

function startPackHover() {
  if (state.stage !== "sealed" || tearDrag.active) return;
  stage.classList.add("is-pack-hovered");
}

function endPackHover() {
  stage.classList.remove("is-pack-hovered");
  stage.style.setProperty("--pack-tilt-x", "0deg");
  stage.style.setProperty("--pack-tilt-y", "0deg");
  packShader?.setPointer(0.5, 0.5);
}

function tearOpen() {
  if (state.stage !== "sealed" && state.stage !== "tearing") return;
  setTearProgress(1);
  setStage("opened");
  backgroundShader.burst(1);
  window.setTimeout(() => setStage("pack-exit"), 560);
  window.setTimeout(() => {
    setStage("revealed");
    syncShaderFocus();
  }, 1650);
}

function resetTear() {
  tearDrag.active = false;
  stage.classList.remove("is-dragging");
  if (state.stage === "tearing") setStage("sealed");
  setTearProgress(0);
}

function startTearDrag(event) {
  if (state.stage !== "sealed" && state.stage !== "tearing") return;
  event.preventDefault();
  tearDrag.active = true;
  tearDrag.moved = false;
  tearDrag.startX = event.clientX;
  tearDrag.threshold = Math.max(150, Math.min(window.innerWidth * 0.26, 260));
  stage.classList.add("is-dragging");
  endPackHover();
  setStage("tearing");
  setTearProgress(0);
  tearHandle.setPointerCapture?.(event.pointerId);
}

function moveTearDrag(event) {
  if (!tearDrag.active) return;
  event.preventDefault();
  const travel = tearDrag.startX - event.clientX;
  if (Math.abs(travel) > 8) tearDrag.moved = true;
  setTearProgress(travel / tearDrag.threshold);
  if (tearDrag.progress >= 1) {
    tearDrag.active = false;
    stage.classList.remove("is-dragging");
    tearOpen();
  }
}

function endTearDrag() {
  if (!tearDrag.active) return;
  if (tearDrag.progress >= 0.82) {
    tearDrag.active = false;
    stage.classList.remove("is-dragging");
    tearOpen();
    return;
  }
  resetTear();
}

function startMouseTearDrag(event) {
  if (tearDrag.active) return;
  startTearDrag(event);
}

function moveMouseTearDrag(event) {
  if (!tearDrag.active) return;
  if (event.buttons === 0) {
    endTearDrag();
    return;
  }
  moveTearDrag(event);
}

// A plain click on the pack opens it too; a half-finished drag does not.
function handlePackClick() {
  if (tearDrag.moved) {
    tearDrag.moved = false;
    return;
  }
  tearOpen();
}

function sectionLabel(sectionIndex) {
  return {
    number: String(sectionIndex + 1).padStart(2, "0"),
    title: localize(binderSections[sectionIndex]).title,
  };
}

// Sweep the ink band across the screen; the page content swaps at the
// midpoint, while the band covers everything.
function wipeToPage(sectionIndex, pageIndex, direction, onCover) {
  wipeBusy = true;
  backgroundShader.wipeTo(binderPlate(sectionIndex, pageIndex), {
    direction,
    ...sectionLabel(sectionIndex),
    onCover,
    onDone: () => {
      wipeBusy = false;
    },
  });
}

function openBinder() {
  window.clearTimeout(state.autoBinderTimer);
  state.autoBinderPending = false;
  const wasOpen = document.body.classList.contains("binder-open");
  if (!wasOpen) {
    if (wipeBusy) return;
    wipeToPage(state.sectionIndex, state.pageIndex, 1, showBinder);
    return;
  }
  showBinder();
}

function showBinder() {
  const wasOpen = document.body.classList.contains("binder-open");
  document.body.classList.add("binder-open");
  renderSection(state.sectionIndex, state.pageIndex);
  if (profileCard.dataset.flipped === "true") {
    dockProfileCardToCorner();
  }
  if (!wasOpen) backgroundShader.burst(0.35);
  syncShaderFocus();
}

function getDockedProfileTarget() {
  const isSmall = isSmallScreen();
  const width = isSmall ? Math.min(window.innerWidth * 0.78, 320) : Math.min(window.innerWidth * 0.72, 368);
  const height = width / 0.7;
  return {
    left: isSmall ? -width * 0.28 : -width * 0.18,
    top: window.innerHeight - height * 0.52,
    width,
    transform: "perspective(60rem) rotateX(0deg) rotateY(0deg) rotateZ(-47deg) scale(1)",
  };
}

function animateProfileCardTo(target, onComplete, beforeFreeze) {
  const start = profileCard.getBoundingClientRect();
  const startTransform = getComputedStyle(profileCard).transform;

  window.clearTimeout(state.profileDockTimer);
  document.body.classList.remove("profile-corner-open");
  beforeFreeze?.();
  document.body.classList.add("profile-docking");

  profileCard.style.setProperty("--dock-top", `${start.top}px`);
  profileCard.style.setProperty("--dock-left", `${start.left}px`);
  profileCard.style.setProperty("--dock-width", `${start.width}px`);
  profileCard.style.setProperty("--dock-transform", startTransform === "none" ? "rotate(0deg)" : startTransform);

  void profileCard.offsetWidth;

  requestAnimationFrame(() => {
    profileCard.style.setProperty("--dock-top", `${target.top}px`);
    profileCard.style.setProperty("--dock-left", `${target.left}px`);
    profileCard.style.setProperty("--dock-width", `${target.width}px`);
    profileCard.style.setProperty("--dock-transform", target.transform);
  });

  state.profileDockTimer = window.setTimeout(() => {
    onComplete?.();
    document.body.classList.remove("profile-docking");
    profileCard.style.removeProperty("--dock-top");
    profileCard.style.removeProperty("--dock-left");
    profileCard.style.removeProperty("--dock-width");
    profileCard.style.removeProperty("--dock-transform");
  }, 1080);
}

function measurePackProfileTarget() {
  const wasDocked = document.body.classList.contains("profile-docked");
  const wasCornerOpen = document.body.classList.contains("profile-corner-open");
  const inlineTransform = profileCard.style.transform;
  const inlineTransition = profileCard.style.transition;

  document.body.classList.remove("profile-docked", "profile-corner-open", "profile-docking");
  const targetTransform = getComputedStyle(profileCard).transform;

  profileCard.style.transition = "none";
  profileCard.style.transform = "none";
  const bounds = profileCard.getBoundingClientRect();

  if (inlineTransform) {
    profileCard.style.transform = inlineTransform;
  } else {
    profileCard.style.removeProperty("transform");
  }

  if (inlineTransition) {
    profileCard.style.transition = inlineTransition;
  } else {
    profileCard.style.removeProperty("transition");
  }

  if (wasDocked) document.body.classList.add("profile-docked");
  if (wasCornerOpen) document.body.classList.add("profile-corner-open");

  return {
    left: bounds.left + window.scrollX,
    top: bounds.top + window.scrollY,
    width: bounds.width,
    transform: targetTransform === "none" ? "rotate(0deg)" : targetTransform,
  };
}

function dockProfileCardToCorner() {
  if (document.body.classList.contains("profile-docked") || document.body.classList.contains("profile-docking")) return;
  animateProfileCardTo(getDockedProfileTarget(), undefined, () => {
    document.body.classList.add("profile-docked");
  });
}

function returnProfileCardToPack() {
  if (!document.body.classList.contains("profile-docked") || document.body.classList.contains("profile-docking")) return;
  animateProfileCardTo(measurePackProfileTarget(), () => {
    document.body.classList.remove("profile-docked", "profile-corner-open");
  });
}

function getSectionCards(sectionId) {
  return cards.filter((card) => card.section === sectionId);
}

function getPageCount(sectionId) {
  return Math.max(1, Math.ceil(getSectionCards(sectionId).length / binderViewportLayout.cardsPerPage));
}

function getWrappedSectionIndex(index) {
  return (index + binderSections.length) % binderSections.length;
}

function renderTabs() {
  binderTabs.innerHTML = binderSections
    .map(
      (section, index) => `
        <button class="tab-button" type="button" data-index="${index}" aria-pressed="${index === state.sectionIndex}">
          <span class="tab-index" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
          <span class="tab-label">${escapeHtml(localize(section).title)}</span>
        </button>
      `,
    )
    .join("");

  binderTabs.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (index === state.sectionIndex && state.pageIndex === 0) return;
      const direction = index >= state.sectionIndex ? 1 : -1;
      backgroundShader.burst(0.18);
      if (!wipeBusy) wipeToPage(index, 0, direction, () => renderSection(index, 0, { direction }));
    });
  });
}

function renderSection(index, pageIndex = 0, { direction = 1, quiet = false } = {}) {
  const wrappedIndex = getWrappedSectionIndex(index);
  const sectionChanged = wrappedIndex !== state.sectionIndex;
  state.sectionIndex = wrappedIndex;
  const section = binderSections[wrappedIndex];
  const view = localize(section);
  const sectionCards = getSectionCards(section.id);
  const pageCount = getPageCount(section.id);
  const clampedPageIndex = clamp(pageIndex, 0, pageCount - 1);
  const pageStart = clampedPageIndex * binderViewportLayout.cardsPerPage;
  const pageCards = sectionCards.slice(pageStart, pageStart + binderViewportLayout.cardsPerPage);
  const columnCount = binderViewportLayout.columns;
  const rowCount = Math.ceil(binderViewportLayout.cardsPerPage / columnCount);
  state.pageIndex = clampedPageIndex;

  sectionNumber.textContent = String(wrappedIndex + 1).padStart(2, "0");
  sectionTitle.textContent = view.title;
  sectionDescription.textContent = view.description;
  pageIndicator.textContent = `${clampedPageIndex + 1} / ${pageCount}`;
  pageIndicator.setAttribute("aria-label", text().pageAria(clampedPageIndex + 1, pageCount));
  prevSection.disabled = binderSections.length <= 1 && pageCount <= 1;
  nextSection.disabled = binderSections.length <= 1 && pageCount <= 1;

  binderPage.classList.remove("is-turning", "is-quiet");
  if (sectionChanged && !quiet) {
    const left = document.querySelector(".binder-left");
    left.classList.remove("is-changing");
    void left.offsetWidth;
    left.classList.add("is-changing");
  }
  void binderPage.offsetWidth;
  binderPage.classList.add(quiet ? "is-quiet" : "is-turning");
  binderPage.dataset.turn = direction < 0 ? "prev" : "next";
  binderPage.dataset.cardCount = String(pageCards.length);
  binderPage.style.setProperty("--binder-columns", String(columnCount));
  binderPage.style.setProperty("--binder-rows", String(rowCount));
  binderPage.style.setProperty("--layout-columns", String(binderViewportLayout.columns));
  binderPage.dataset.columns = String(binderViewportLayout.columns);
  binderPage.style.setProperty(
    "--layout-rows",
    String(Math.ceil(binderViewportLayout.cardsPerPage / binderViewportLayout.columns)),
  );
  binderStage.style.setProperty("--section-color", sectionColors[wrappedIndex % sectionColors.length]);

  disposeCardShaders();
  // Every page shows the full set of sleeves; unused ones stay empty.
  binderPage.innerHTML = Array.from({ length: binderViewportLayout.cardsPerPage }, (_, slot) =>
    pageCards[slot]
      ? `<div class="pocket">${renderBinderCard(pageCards[slot])}</div>`
      : `<div class="pocket is-empty" aria-hidden="true"></div>`,
  ).join("");
  if (document.body.classList.contains("binder-open")) paintVisibleCardArt(binderPage);

  binderTabs.querySelectorAll("button").forEach((button, buttonIndex) => {
    button.setAttribute("aria-pressed", String(buttonIndex === state.sectionIndex));
  });

  binderPage.querySelectorAll(".binder-card").forEach((cardEl, cardIndex) => {
    cardEl.style.setProperty("--stagger", `${cardIndex * 110}ms`);
    cardEl.style.setProperty("--rest-tilt", restTilts[cardIndex % restTilts.length]);
    cardEl.addEventListener("click", () => {
      if (performance.now() < swipeSuppressUntil) return;
      openCardDetail(cardEl.dataset.cardId, cardEl);
    });

    let shader = null;
    const shaderCanvas = cardEl.querySelector(".rarity-shader");
    if (shaderCanvas && cardEl.dataset.edition) {
      shader = attachCardShader(shaderCanvas, cardEl.dataset.edition);
      if (shader) cardShaders.push(shader);
    }

    cardEl.addEventListener("pointermove", (event) => {
      const bounds = cardEl.getBoundingClientRect();
      const tx = clamp((event.clientX - bounds.left) / bounds.width, 0, 1) - 0.5;
      const ty = clamp((event.clientY - bounds.top) / bounds.height, 0, 1) - 0.5;
      cardEl.style.setProperty("--card-tilt-x", `${(-ty * 6).toFixed(2)}deg`);
      cardEl.style.setProperty("--card-tilt-y", `${(tx * 8).toFixed(2)}deg`);
      cardEl.style.setProperty("--mx", `${((tx + 0.5) * 100).toFixed(1)}%`);
      cardEl.style.setProperty("--my", `${((ty + 0.5) * 100).toFixed(1)}%`);
      shader?.setPointer(0.5 + tx * 0.3, 0.5 + ty * 0.3);
    });
    cardEl.addEventListener("pointerleave", () => {
      cardEl.style.setProperty("--card-tilt-x", "0deg");
      cardEl.style.setProperty("--card-tilt-y", "0deg");
      shader?.setPointer(0.5, 0.5);
    });
  });
}

function turnBinderPage(direction) {
  if (wipeBusy) return;
  const section = binderSections[state.sectionIndex];
  const pageCount = getPageCount(section.id);
  let targetSection = state.sectionIndex;
  let targetPage = state.pageIndex + direction;
  backgroundShader.burst(0.18);

  if (targetPage < 0 || targetPage >= pageCount) {
    targetSection = getWrappedSectionIndex(state.sectionIndex + direction);
    targetPage = direction > 0 ? 0 : getPageCount(binderSections[targetSection].id) - 1;
  }

  wipeToPage(targetSection, targetPage, direction, () => renderSection(targetSection, targetPage, { direction }));
}

function handleBinderPageClick(event) {
  if (event.target.closest(".binder-card")) return;

  const bounds = binderPage.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const edgeWidth = Math.min(bounds.width * 0.24, 160);

  if (x <= edgeWidth) {
    turnBinderPage(-1);
    return;
  }

  if (x >= bounds.width - edgeWidth) {
    turnBinderPage(1);
  }
}

// Touch users can also swipe the page; the arrows and page edges still work.
const swipe = { id: null, x: 0, y: 0 };

function startSwipe(event) {
  if (event.pointerType === "mouse") return;
  swipe.id = event.pointerId;
  swipe.x = event.clientX;
  swipe.y = event.clientY;
}

function endSwipe(event) {
  if (swipe.id !== event.pointerId) return;
  swipe.id = null;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
  swipeSuppressUntil = performance.now() + 400;
  turnBinderPage(dx < 0 ? 1 : -1);
}

function renderBinderCard(card) {
  const view = localize(card);
  const artImage = card.image
    ? `<img class="card-art-image" src="${escapeHtml(card.image)}" alt="${escapeHtml(view.imageAlt ?? "")}" loading="lazy" />`
    : `<canvas class="card-art-canvas" data-card-art="${escapeHtml(card.id)}" data-uid="b-"></canvas>`;
  const tier = card.rarityTier ?? "common";
  const edition = card.edition ?? editionByTier[tier] ?? "";
  const shaderLayer = edition ? `<canvas class="rarity-shader" aria-hidden="true"></canvas>` : "";

  return `
    <button class="binder-card accent-${card.accent} rarity-${tier}" type="button" data-card-id="${escapeHtml(card.id)}" data-rarity="${tier}" data-edition="${edition}">
      <span class="card-art">
        ${artImage}
      </span>
      ${shaderLayer}
      <span class="rarity-foil" aria-hidden="true"></span>
      <span class="rarity-sparkle" aria-hidden="true"></span>
      <span class="rarity-glare" aria-hidden="true"></span>
      <span class="rarity-edge" aria-hidden="true"></span>
      <span class="card-topline">
        <span>${escapeHtml(view.eyebrow)}</span>
        <span class="rarity-label">${escapeHtml(view.rarity)}</span>
      </span>
      <span class="card-copy">
        <strong>${escapeHtml(view.title)}</strong>
        <span>${escapeHtml(view.kind)}</span>
      </span>
      <span class="tag-row">
        ${view.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
      </span>
    </button>
  `;
}

function renderDetail(card) {
  const view = localize(card);
  const tier = card.rarityTier ?? "common";
  const hero = card.image
    ? `<img class="detail-hero-image" src="${escapeHtml(card.image)}" alt="${escapeHtml(view.imageAlt ?? "")}" aria-hidden="true" />`
    : `<div class="detail-hero-art" aria-hidden="true"><canvas class="card-art-canvas" data-card-art="${escapeHtml(card.id)}" data-uid="d-"></canvas></div>`;
  const paragraphs = String(view.summary ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");

  return `
    <div class="detail-hero accent-${card.accent} rarity-${tier}${card.image ? " has-detail-image" : ""}">
      ${hero}
      <div class="detail-foil"></div>
      <div class="detail-heading">
        <p>${escapeHtml(view.eyebrow)} · ${escapeHtml(view.rarity)}</p>
        <h2>${escapeHtml(view.title)}</h2>
        <span>${escapeHtml(view.kind)}</span>
      </div>
    </div>
    <div class="detail-body accent-${card.accent}">
      ${paragraphs}
      <div class="detail-tags">
        ${view.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
      </div>
      <div class="detail-actions">
        ${
          card.link
            ? `<a class="case-link store-link" href="${escapeHtml(card.link)}" target="_blank" rel="noopener">${storeLabel(card.link)}</a>`
            : ""
        }
        ${
          card.caseStudy
            ? `<a class="case-link" href="${escapeHtml(card.caseStudy)}">${text().readCase}</a>`
            : card.link
              ? ""
              : `<span class="case-link disabled">${text().caseSoon}</span>`
        }
      </div>
    </div>
  `;
}

// Where a project lives: its store page names the button.
function storeLabel(url) {
  if (/itch\.io/.test(url)) return text().playItch;
  if (/steampowered\.com/.test(url)) return text().viewSteam;
  return text().openLink;
}

function openCardDetail(cardId, sourceEl) {
  const card = cards.find((item) => item.id === cardId);
  if (!card) return;
  const sourceBounds = sourceEl?.getBoundingClientRect();
  detailReturnTarget = sourceBounds
    ? {
        x: sourceBounds.left + sourceBounds.width / 2,
        y: sourceBounds.top + sourceBounds.height / 2,
        width: sourceBounds.width,
        height: sourceBounds.height,
      }
    : null;
  isClosingDetail = false;
  detailCardId = card.id;
  dialogCard.innerHTML = renderDetail(card);

  dialog.classList.remove("is-detail-entering", "is-detail-open");
  dialog.getAnimations().forEach((animation) => animation.cancel());
  dialog.showModal();
  paintVisibleCardArt(dialogCard);

  if (!sourceBounds) return;
  const dialogBounds = dialog.getBoundingClientRect();
  const startX = sourceBounds.left + sourceBounds.width / 2 - (dialogBounds.left + dialogBounds.width / 2);
  const startY = sourceBounds.top + sourceBounds.height / 2 - (dialogBounds.top + dialogBounds.height / 2);
  const startScaleX = sourceBounds.width / dialogBounds.width;
  const startScaleY = sourceBounds.height / dialogBounds.height;

  dialog.classList.add("is-detail-entering");
  const detailAnimation = dialog.animate(
    [
      {
        opacity: 0,
        filter: "blur(0.35rem) saturate(0.75)",
        transform: `translate(${startX.toFixed(1)}px, ${startY.toFixed(1)}px) scale(${startScaleX.toFixed(4)}, ${startScaleY.toFixed(4)}) rotate(-4deg)`,
      },
      {
        opacity: 1,
        filter: "blur(0) saturate(1)",
        offset: 0.62,
        transform: "translate(0, 0) scale(1.015) rotate(0.6deg)",
      },
      {
        opacity: 1,
        filter: "blur(0) saturate(1)",
        transform: "translate(0, 0) scale(1) rotate(0deg)",
      },
    ],
    {
      duration: reduceMotionQuery.matches ? 1 : 640,
      easing: "cubic-bezier(0.2, 0.9, 0.18, 1)",
      fill: "both",
    },
  );

  detailAnimation.finished
    .catch(() => {})
    .finally(() => {
      detailAnimation.cancel();
      dialog.classList.remove("is-detail-entering");
    });

  requestAnimationFrame(() => {
    dialog.classList.add("is-detail-open");
  });
}

function getDetailReturnTransform() {
  if (!detailReturnTarget) return null;
  const dialogBounds = dialog.getBoundingClientRect();
  return {
    x: detailReturnTarget.x - (dialogBounds.left + dialogBounds.width / 2),
    y: detailReturnTarget.y - (dialogBounds.top + dialogBounds.height / 2),
    scaleX: detailReturnTarget.width / dialogBounds.width,
    scaleY: detailReturnTarget.height / dialogBounds.height,
  };
}

function closeCardDetail() {
  if (!dialog.open || isClosingDetail) return;
  const target = getDetailReturnTransform();
  if (!target) {
    dialog.close();
    return;
  }

  isClosingDetail = true;
  dialog.getAnimations().forEach((animation) => animation.cancel());
  dialog.classList.add("is-detail-closing");

  const closeAnimation = dialog.animate(
    [
      {
        opacity: 1,
        filter: "blur(0) saturate(1)",
        transform: "translate(0, 0) scale(1) rotate(0deg)",
      },
      {
        opacity: 0,
        filter: "blur(0.35rem) saturate(0.75)",
        transform: `translate(${target.x.toFixed(1)}px, ${target.y.toFixed(1)}px) scale(${target.scaleX.toFixed(4)}, ${target.scaleY.toFixed(4)}) rotate(-3deg)`,
      },
    ],
    {
      duration: reduceMotionQuery.matches ? 1 : 440,
      easing: "cubic-bezier(0.45, 0, 0.22, 1)",
      fill: "both",
    },
  );

  closeAnimation.finished
    .catch(() => {})
    .finally(() => {
      closeAnimation.cancel();
      dialog.close();
    });
}

function flipProfileCard() {
  if (profileCard.dataset.flipped === "true") return;
  burstFlipParticles();
  backgroundShader.burst(0.55);
  profileCard.dataset.flipped = "true";
  profileCard.setAttribute("aria-pressed", "true");
  updateProfileAria();
  scheduleAutoBinderOpen();
}

function scheduleAutoBinderOpen() {
  window.clearTimeout(state.autoBinderTimer);
  state.autoBinderPending = false;
  state.autoBinderTimer = window.setTimeout(() => {
    if (document.body.classList.contains("binder-open")) return;
    if (isProfileCardHovered()) {
      state.autoBinderPending = true;
      return;
    }
    openBinder();
  }, 2600);
}

function isProfileCardHovered() {
  const bounds = profileCard.getBoundingClientRect();
  const pointerInside =
    Number.isFinite(profileHover.clientX) &&
    Number.isFinite(profileHover.clientY) &&
    profileHover.clientX >= bounds.left &&
    profileHover.clientX <= bounds.right &&
    profileHover.clientY >= bounds.top &&
    profileHover.clientY <= bounds.bottom;

  return profileHover.mouseOver || profileCard.matches(":hover") || pointerInside;
}

function resumePendingAutoBinder() {
  if (
    !state.autoBinderPending ||
    profileCard.dataset.flipped !== "true" ||
    document.body.classList.contains("binder-open") ||
    isProfileCardHovered()
  ) {
    return;
  }

  state.autoBinderPending = false;
  window.clearTimeout(state.autoBinderTimer);
  state.autoBinderTimer = window.setTimeout(openBinder, 240);
}

// The flip throws printed paper out from behind the card: chips, strips,
// halftone dots and registration marks fly out and flutter down, and speed
// lines shoot past, all at depths behind the card.
function burstFlipParticles() {
  const inks = ["var(--hot)", "var(--blue)", "var(--gold)", "var(--teal)", "var(--paper)"];
  const kinds = ["chip", "strip", "line", "chip", "dot", "line", "strip", "mark", "chip", "line"];
  const fragment = document.createDocumentFragment();
  const count = isSmallScreen() ? 30 : 44;

  flipParticles.querySelectorAll("span").forEach((particle) => particle.remove());
  flipParticles.classList.remove("is-bursting");
  void flipParticles.offsetWidth;
  flipParticles.classList.add("is-bursting");

  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement("span");
    const kind = kinds[index % kinds.length];
    const angle = Math.PI * 2 * (index / count) + (Math.random() - 0.5) * 0.45;
    const distance = kind === "line" ? 150 + Math.random() * 130 : 110 + Math.random() * 250;
    const size = {
      chip: 20 + Math.random() * 14,
      strip: 18 + Math.random() * 8,
      dot: 13 + Math.random() * 9,
      mark: 22 + Math.random() * 10,
      line: 44 + Math.random() * 50,
    }[kind];

    particle.dataset.kind = kind;
    particle.style.setProperty("--x", `${(Math.cos(angle) * distance).toFixed(1)}px`);
    particle.style.setProperty("--y", `${(Math.sin(angle) * distance * 0.9).toFixed(1)}px`);
    particle.style.setProperty("--fall", `${Math.round(70 + Math.random() * 150)}px`);
    particle.style.setProperty("--reach", `${Math.round(distance)}px`);
    particle.style.setProperty("--z", `${Math.round(-60 - Math.random() * 110)}px`);
    particle.style.setProperty("--angle", `${((angle * 180) / Math.PI + 90).toFixed(1)}deg`);
    particle.style.setProperty("--size", `${size.toFixed(1)}px`);
    particle.style.setProperty("--delay", `${Math.round(Math.random() * (kind === "line" ? 60 : 140))}ms`);
    particle.style.setProperty("--spin", `${Math.round((Math.random() - 0.5) * 900)}deg`);
    // A gentle flutter keeps most pieces facing the viewer.
    particle.style.setProperty("--flip", `${Math.round((Math.random() - 0.5) * 320)}deg`);
    particle.style.setProperty("--ink-color", inks[index % inks.length]);
    fragment.appendChild(particle);
  }

  flipParticles.appendChild(fragment);
  window.setTimeout(() => {
    flipParticles.querySelectorAll("span").forEach((particle) => particle.remove());
    flipParticles.classList.remove("is-bursting");
  }, 1900);
}

function beginProfileScale(to, now = performance.now()) {
  profileHover.scaling = true;
  profileHover.scaleStart = now;
  profileHover.scaleFrom = profileHover.scale;
  profileHover.scaleTo = to;
}

function updateProfilePointer(event) {
  rememberProfilePointer(event);
  const bounds = profileCard.getBoundingClientRect();
  profileHover.pointerX = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
  profileHover.pointerY = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
  profileCard.style.setProperty("--mx", `${(50 + (profileHover.pointerX - 0.5) * 20).toFixed(2)}%`);
  profileCard.style.setProperty("--my", `${(40 + (profileHover.pointerY - 0.5) * 20).toFixed(2)}%`);
  profileCard.style.setProperty("--foil-x", `${(50 + (profileHover.pointerX - 0.5) * 20).toFixed(2)}%`);
  profileCard.style.setProperty("--foil-y", `${(40 + (profileHover.pointerY - 0.5) * 20).toFixed(2)}%`);
  profileCard.style.setProperty("--holo-x", `${(50 + (profileHover.pointerX - 0.5) * 16).toFixed(2)}%`);
  profileCard.style.setProperty("--holo-y", `${(50 + (profileHover.pointerY - 0.5) * 16).toFixed(2)}%`);
}

function rememberProfilePointer(event) {
  profileHover.clientX = event.clientX;
  profileHover.clientY = event.clientY;
}

function startProfileHover(event) {
  const wasMouseOver = profileHover.mouseOver;
  profileHover.mouseOver = true;
  updateProfilePointer(event);
  if (!wasMouseOver) beginProfileScale(profileHover.scaleMultiplier);
}

function moveProfileHover(event) {
  if (!profileHover.mouseOver) {
    startProfileHover(event);
    return;
  }
  updateProfilePointer(event);
}

function endProfileHover() {
  profileHover.mouseOver = false;
  profileHover.pointerX = 0.5;
  profileHover.pointerY = 0.5;
  profileCard.style.setProperty("--mx", "50%");
  profileCard.style.setProperty("--my", "28%");
  profileCard.style.setProperty("--foil-x", "50%");
  profileCard.style.setProperty("--foil-y", "28%");
  profileCard.style.setProperty("--holo-x", "50%");
  profileCard.style.setProperty("--holo-y", "50%");
  beginProfileScale(1);
  resumePendingAutoBinder();
}

function updateProfileCornerOpen(event) {
  if (!document.body.classList.contains("profile-docked")) return;
  const hotZone = isSmallScreen() ? 190 : 220;
  const isInCorner = event.clientX <= hotZone && event.clientY >= window.innerHeight - hotZone;
  const isOverCard = Boolean(event.target.closest?.("#profileCard"));
  document.body.classList.toggle("profile-corner-open", isInCorner || isOverCard);
}

function syncProfileDockWithScroll() {
  if (!document.body.classList.contains("binder-open") || profileCard.dataset.flipped !== "true") return;
  const packBounds = stage.getBoundingClientRect();
  const binderBounds = binderStage.getBoundingClientRect();
  const isPackActive = packBounds.top < window.innerHeight * 0.38 && packBounds.bottom > window.innerHeight * 0.56;
  const isBinderActive = binderBounds.top < window.innerHeight * 0.54 && binderBounds.bottom > window.innerHeight * 0.34;

  if (isPackActive) {
    returnProfileCardToPack();
    return;
  }

  if (isBinderActive && !document.body.classList.contains("profile-docked")) {
    dockProfileCardToCorner();
  }
}

function renderProfileHover(now) {
  const isDocked = document.body.classList.contains("profile-docked");

  if (isDocked) {
    profileHover.scaling = false;
    profileHover.scale = 1;
  }

  if (profileHover.scaling) {
    const t = clamp((now - profileHover.scaleStart) / profileHover.scaleDuration, 0, 1);
    const curved = easeInOut(t);
    profileHover.scale = profileHover.scaleFrom + (profileHover.scaleTo - profileHover.scaleFrom) * curved;
    if (t >= 1) profileHover.scaling = false;
  }

  let pitch = 0;
  let yaw = 0;
  let swayZ = 0;

  if (!isDocked && profileHover.mouseOver) {
    const offsetX = 0.5 - profileHover.pointerX;
    const offsetY = 0.5 - profileHover.pointerY;
    pitch = -offsetY * profileHover.pressRange;
    yaw = offsetX * profileHover.yawRange;
  } else if (!isDocked && !profileHover.scaling) {
    swayZ = Math.sin((now / 1000) * profileHover.swaySpeed) * profileHover.swayRange;
  }

  profileCard.style.setProperty("--profile-scale", profileHover.scale.toFixed(3));
  profileCard.style.setProperty("--profile-rotate-x", `${pitch.toFixed(2)}deg`);
  profileCard.style.setProperty("--profile-rotate-y", `${yaw.toFixed(2)}deg`);
  profileCard.style.setProperty("--profile-rotate-z", `${swayZ.toFixed(2)}deg`);
  requestAnimationFrame(renderProfileHover);
}

function handleWheel(event) {
  if (document.body.classList.contains("is-opening")) return;
  if (!document.body.classList.contains("binder-open")) {
    if (state.stage === "sealed" && event.deltaY > 12) tearOpen();
    if (state.stage === "revealed" && event.deltaY > 18) openBinder();
  }
}

function handleKeydown(event) {
  if (!document.body.classList.contains("binder-open") || dialog.open) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.key === "ArrowRight") turnBinderPage(1);
  if (event.key === "ArrowLeft") turnBinderPage(-1);
}

function syncBinderViewportLayout() {
  window.clearTimeout(binderResizeTimer);
  binderResizeTimer = window.setTimeout(() => {
    syncShaderFocus();
    const nextLayout = getBinderViewportLayout();
    if (
      nextLayout.cardsPerPage === binderViewportLayout.cardsPerPage &&
      nextLayout.columns === binderViewportLayout.columns
    ) {
      if (document.body.classList.contains("binder-open")) paintVisibleCardArt(binderPage);
      return;
    }

    const firstVisibleCard = state.pageIndex * binderViewportLayout.cardsPerPage;
    binderViewportLayout = nextLayout;

    if (document.body.classList.contains("binder-open")) {
      renderSection(state.sectionIndex, Math.floor(firstVisibleCard / nextLayout.cardsPerPage), { quiet: true });
    }
  }, 120);
}

mountStaticArt();
paintProfileFaces();
applyTheme();
applyLanguage({ rerender: false });
renderTabs();
renderSection(state.sectionIndex, 0, { quiet: true });
syncShaderFocus(true);
// Opening: one cube tells the story in four beats (src/opening.js); then an
// ink band sweeps it away downward to reveal the first screen. Any click or
// key skips straight to the sweep; the hero intro starts under the sweep.
function sweepOpening(opening, done) {
  const band = document.querySelector(".opening-sweep");
  const duration = 820;
  let start = null;
  band?.classList.add("is-active");
  // The band enters from above the screen and leaves below it; the opening
  // is cut away along the band's middle, so the seam never shows.
  const step = (now) => {
    start ??= now;
    const k = Math.min((now - start) / duration, 1);
    const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const height = band?.offsetHeight ?? 0;
    const top = -height + eased * (window.innerHeight + height);
    if (band) band.style.transform = `translateY(${top.toFixed(1)}px)`;
    opening.style.clipPath = `inset(${Math.max(0, top + height / 2).toFixed(1)}px 0 0 0)`;
    if (k < 1) {
      requestAnimationFrame(step);
      return;
    }
    band?.classList.remove("is-active");
    band?.style.removeProperty("transform");
    done();
  };
  requestAnimationFrame(step);
}

function runOpening() {
  const opening = document.querySelector("#opening");
  if (!opening) return Promise.resolve();

  return new Promise((resolve) => {
    let finished = false;
    let show = null;

    const close = () => {
      show?.stop();
      opening.classList.add("is-done");
    };

    const exit = () => {
      if (finished) return;
      finished = true;
      opening.removeEventListener("pointerdown", exit);
      document.removeEventListener("keydown", exit);
      document.body.classList.remove("is-opening");
      if (reduceMotionQuery.matches || !show) {
        opening.classList.add("is-leaving");
        window.setTimeout(close, 450);
      } else {
        sweepOpening(opening, close);
      }
      resolve();
    };

    show = startOpening({
      canvas: opening.querySelector(".opening-scene"),
      overlay: opening.querySelector(".opening-overlay"),
      language,
      reduceMotion: reduceMotionQuery.matches,
      onEnd: exit,
    });
    // Without WebGL2 there is no show to play: go straight to the page.
    if (!show) {
      exit();
      return;
    }
    opening.addEventListener("pointerdown", exit);
    document.addEventListener("keydown", exit);
    document.body.classList.add("is-opening");
    opening.classList.add("is-playing");
  });
}

runOpening().then(() => {
  requestAnimationFrame(() => {
    document.body.classList.add("intro-ready");
    window.setTimeout(() => {
      document.body.classList.add("intro-complete");
      syncShaderFocus();
    }, 2400);
  });
});

themeToggle.addEventListener("click", cycleThemeMode);
langToggle.addEventListener("click", toggleLanguage);
systemThemeQuery.addEventListener("change", () => {
  if (themeMode === "system") applyTheme();
});
packZone.addEventListener("pointerenter", startPackHover);
packZone.addEventListener("pointermove", setPackTilt);
packZone.addEventListener("pointerleave", endPackHover);
packZone.addEventListener("click", handlePackClick);
tearButton.onclick = tearOpen;
tearHandle.addEventListener("pointerdown", startTearDrag);
document.addEventListener("pointermove", moveTearDrag);
document.addEventListener("pointerup", endTearDrag);
tearHandle.addEventListener("pointercancel", resetTear);
tearHandle.addEventListener("mousedown", startMouseTearDrag);
document.addEventListener("mousemove", moveMouseTearDrag);
document.addEventListener("mouseup", endTearDrag);
window.addEventListener("blur", resetTear);
tearHandle.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") tearOpen();
});
openBinderButton.onclick = openBinder;
prevSection.addEventListener("click", () => turnBinderPage(-1));
nextSection.addEventListener("click", () => turnBinderPage(1));
binderPage.addEventListener("click", handleBinderPageClick);
binderPage.addEventListener("pointerdown", startSwipe);
binderPage.addEventListener("pointerup", endSwipe);
binderPage.addEventListener("pointercancel", () => {
  swipe.id = null;
});
closeDialog.addEventListener("click", closeCardDetail);
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCardDetail();
});
dialog.addEventListener("close", () => {
  dialog.getAnimations().forEach((animation) => animation.cancel());
  dialog.classList.remove("is-detail-entering", "is-detail-open", "is-detail-closing");
  detailReturnTarget = null;
  detailCardId = null;
  isClosingDetail = false;
});
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) closeCardDetail();
});
document.addEventListener("keydown", handleKeydown);
document.addEventListener("pointermove", rememberProfilePointer);
document.addEventListener("pointermove", updateProfileCornerOpen);
document.addEventListener("pointermove", resumePendingAutoBinder);
window.addEventListener("wheel", handleWheel, { passive: true });
window.addEventListener("scroll", syncProfileDockWithScroll, { passive: true });
window.addEventListener("resize", syncProfileDockWithScroll);
window.addEventListener("resize", syncBinderViewportLayout);

profileCard.addEventListener("click", flipProfileCard);
profileCard.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  flipProfileCard();
});
profileCard.addEventListener("pointerenter", startProfileHover);
profileCard.addEventListener("pointermove", moveProfileHover);
profileCard.addEventListener("pointerleave", endProfileHover);
profileCard.addEventListener("mouseenter", startProfileHover);
profileCard.addEventListener("mousemove", moveProfileHover);
profileCard.addEventListener("mouseleave", endProfileHover);
requestAnimationFrame(renderProfileHover);

window.__portfolioDebug = { tearOpen, openBinder, renderSection, state };
