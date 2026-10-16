// Restaurant config: single source of truth for hours, menus and booking rules.
const CONFIG = {
  whatsapp: "6562231276", // TODO: confirm this number is on WhatsApp Business
  timeZone: "Asia/Singapore",
  // 0 = Sunday. Times are minutes from midnight.
  hours: {
    lunch: { open: 11 * 60 + 30, close: 14 * 60 + 30, lastSeating: 13 * 60 + 30 },
    dinner: { open: 17 * 60 + 30, close: 21 * 60 + 30, lastSeating: 20 * 60 + 30 },
  },
  closedDays: [0],
  maxGuests: 8,
  menus: {
    lunch: ["Lunch Omakase (S$78++)"],
    dinner: ["Dinner I (S$128++)", "Dinner II (S$168++)", "Dinner III (S$238++)"],
  },
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const $ = (sel, root = document) => root.querySelector(sel);

const fmt = (mins) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  const ampm = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}${ampm}`;
};

// Current day and minutes in Singapore, regardless of the visitor's own time zone.
function nowInSingapore() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CONFIG.timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { day, mins: Number(get("hour")) * 60 + Number(get("minute")) };
}

function todayISOInSingapore() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CONFIG.timeZone }).format(new Date());
}

function renderStatus() {
  const el = $("#open-status");
  const { day, mins } = nowInSingapore();
  const { lunch, dinner } = CONFIG.hours;
  el.classList.remove("open");
  if (CONFIG.closedDays.includes(day)) {
    el.textContent = "Closed today · Opens Monday 11:30am";
    return;
  }
  for (const [name, s] of [["Lunch", lunch], ["Dinner", dinner]]) {
    if (mins >= s.open && mins < s.close) {
      el.classList.add("open");
      el.textContent = `Open now · ${name} until ${fmt(s.close)}`;
      return;
    }
  }
  if (mins < lunch.open) el.textContent = `Opens today at ${fmt(lunch.open)}`;
  else if (mins < dinner.open) el.textContent = `Dinner from ${fmt(dinner.open)} today`;
  else el.textContent = day === 6 ? "Closed now · Opens Monday 11:30am" : "Closed now · Opens tomorrow 11:30am";
}

function renderHours() {
  const { day } = nowInSingapore();
  const { lunch, dinner } = CONFIG.hours;
  const order = [1, 2, 3, 4, 5, 6, 0];
  $("#hours-body").innerHTML = order.map((d) => {
    const closed = CONFIG.closedDays.includes(d);
    const text = closed ? "Closed" : `${fmt(lunch.open)}–${fmt(lunch.close)}<br>${fmt(dinner.open)}–${fmt(dinner.close)}`;
    return `<tr class="${d === day ? "today" : ""}"><td>${DAYS[d]}</td><td>${text}</td></tr>`;
  }).join("");
}

function setupNav() {
  const nav = $(".nav"), toggle = $(".nav-toggle"), list = $("#nav-links");
  toggle.addEventListener("click", () => {
    const open = list.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  list.addEventListener("click", (e) => {
    if (e.target.closest("a")) { list.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }
  });
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      select(next); next.focus();
    });
  });
  // Default to dinner after lunch service ends.
  if (nowInSingapore().mins >= CONFIG.hours.lunch.close) select($("#tab-dinner"));
}

function setupBooking() {
  const form = $("#booking");
  const f = form.elements;
  const err = $("#form-error");

  const today = todayISOInSingapore();
  f.date.min = today;
  f.date.value = today;
  f.guests.innerHTML = Array.from({ length: CONFIG.maxGuests }, (_, i) =>
    `<option value="${i + 1}"${i === 1 ? " selected" : ""}>${i + 1} ${i ? "guests" : "guest"}</option>`).join("");

  const slotsFor = (service) => {
    const s = CONFIG.hours[service], out = [];
    for (let m = s.open; m <= s.lastSeating; m += 30) out.push(m);
    return out;
  };

  const refresh = () => {
    const service = f.service.value;
    const isToday = f.date.value === today;
    const { mins } = nowInSingapore();
    // Same-day slots need at least 1 hour notice.
    const slots = slotsFor(service).filter((m) => !isToday || m >= mins + 60);
    f.time.innerHTML = slots.length
      ? slots.map((m) => `<option value="${fmt(m)}">${fmt(m)}</option>`).join("")
      : `<option value="">No slots left, pick another date</option>`;
    const prevMenu = f.menu.value;
    f.menu.innerHTML = CONFIG.menus[service].map((m) => `<option>${m}</option>`).join("");
    if (CONFIG.menus[service].includes(prevMenu)) f.menu.value = prevMenu;
  };

  f.service.addEventListener("change", refresh);
  f.date.addEventListener("change", refresh);
  refresh();

  // If nothing is bookable today, move to the next open day.
  if (!f.time.value) {
    if (f.service.value === "lunch") { f.service.value = "dinner"; refresh(); }
    if (!f.time.value) {
      const d = new Date(`${today}T00:00:00`);
      do d.setDate(d.getDate() + 1); while (CONFIG.closedDays.includes(d.getDay()));
      f.date.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      f.service.value = "lunch";
      refresh();
    }
  }

  // Menu cards preselect the form.
  document.querySelectorAll("[data-service]").forEach((a) => a.addEventListener("click", () => {
    f.service.value = a.dataset.service;
    refresh();
    const match = CONFIG.menus[a.dataset.service].find((m) => m.startsWith(a.dataset.menu));
    if (match) f.menu.value = match;
  }));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    [...form.querySelectorAll("[aria-invalid]")].forEach((el) => el.removeAttribute("aria-invalid"));
    const problems = [];
    const day = new Date(`${f.date.value}T00:00:00`).getDay();
    if (!f.date.value || f.date.value < today) { problems.push("Choose a date from today onwards."); f.date.setAttribute("aria-invalid", "true"); }
    else if (CONFIG.closedDays.includes(day)) { problems.push("We are closed on Sundays."); f.date.setAttribute("aria-invalid", "true"); }
    if (!f.time.value) { problems.push("Choose a time."); f.time.setAttribute("aria-invalid", "true"); }
    if (!f.name.value.trim()) { problems.push("Enter your name."); f.name.setAttribute("aria-invalid", "true"); }
    if (f.phone.value.replace(/\D/g, "").length < 8) { problems.push("Enter a valid mobile number."); f.phone.setAttribute("aria-invalid", "true"); }
    err.textContent = problems.join(" ");
    if (problems.length) { form.querySelector("[aria-invalid]").focus(); return; }

    const dateLabel = new Date(`${f.date.value}T00:00:00`).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const lines = [
      "Hi Cho, I'd like to request a reservation:",
      `• ${dateLabel}, ${f.time.value} (${f.service.value})`,
      `• ${f.guests.value} guest(s), ${f.menu.value}`,
      `• Name: ${f.name.value.trim()}`,
      `• Mobile: ${f.phone.value.trim()}`,
    ];
    if (f.notes.value.trim()) lines.push(`• Notes: ${f.notes.value.trim()}`);
    window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener");
  });
}

function setupReveal() {
  const targets = document.querySelectorAll("section:not(.hero) > *");
  if (!("IntersectionObserver" in window)) return;
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
  }), { rootMargin: "0px 0px -10% 0px" });
  targets.forEach((t) => { t.classList.add("reveal"); io.observe(t); });

  // Hide the floating mobile CTA while the booking form is on screen.
  const cta = $(".mobile-cta");
  new IntersectionObserver(([en]) => cta.classList.toggle("hide", en.isIntersecting), { threshold: 0.15 })
    .observe($("#reserve"));
}

$("#year").textContent = new Date().getFullYear();
renderStatus();
renderHours();
setupNav();
setupTabs();
setupBooking();
setupReveal();
setInterval(renderStatus, 60_000);
