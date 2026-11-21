
const navigation = [
    { id: "home", label: "Home", icon: "🏠", url: "home.html" },
    { id: "chat", label: "Chat", icon: "💬", url: "chat.html" },
    { id: "calendar", label: "Calendar", icon: "🗓️", url: "calendar.html" },
    { id: "games", label: "Games", icon: "🎮", url: "games.html" },
    { id: "gallery", label: "Gallery", icon: "🖼️", url: "gallery.html" }
];

export function initPhoneShell(profile, activePage = "home") {
    document.body.classList.add("cp-app");

    // Avoid creating duplicate navigation
    if (document.querySelector(".cp-phone-header")) return;

    const displayName =
        profile?.displayName ||
        profile?.name ||
        "My Love";

    const header = document.createElement("header");
    header.className = "cp-phone-header";

    header.innerHTML = `
        <div class="cp-brand">
            <div class="cp-brand-icon">💜</div>
            <div>
                <div class="cp-brand-name">Classen Purple</div>
                <div class="cp-brand-subtitle">Our little world ❤️</div>
            </div>
        </div>
        <div class="cp-profile-chip"></div>
    `;

    header.querySelector(".cp-profile-chip").textContent = displayName;

    const nav = document.createElement("nav");
    nav.className = "cp-bottom-nav";
    nav.setAttribute("aria-label", "Main navigation");

    navigation.forEach(item => {
        const link = document.createElement("a");
        link.className =
            "cp-nav-item" + (item.id === activePage ? " active" : "");
        link.href = item.url;
        link.setAttribute("aria-label", item.label);

        if (item.id === activePage) {
            link.setAttribute("aria-current", "page");
        }

        const icon = document.createElement("span");
        icon.className = "cp-nav-icon";
        icon.textContent = item.icon;

        const label = document.createElement("span");
        label.textContent = item.label;

        link.append(icon, label);
        nav.appendChild(link);
    });

    document.body.prepend(header);
    document.body.appendChild(nav);
}
