# Customizaciones WAR Construcciones

Copia de [kevinrivm/vocero-crm](https://github.com/kevinrivm/vocero-crm) usada
por la agencia WAR Construcciones para todas las instancias de CRM-as-a-service.
Basada en el fork de GudLime (`GudLime/vocero-crm`), con la marca cambiada a War.

## Cambios respecto a upstream

1. **`src/app/war-theme.css`** — override del look (radios chicos, sombras
   mínimas, neutros slate). No toca `--accent*` ni el logo. El hilo de la
   Bandeja (`.thread-bg`) es un plano de `--accent-tint` (el lavado que ya
   inyecta la marca), sin el mosaico de dibujos de `globals.css`.
2. **`src/app/layout.tsx`** — una línea: `import "./war-theme.css"` después
   de `globals.css`.
3. **`src/lib/temas.ts`** — `APARIENCIA_POR_DEFECTO.letra = "inter"`.
4. **`src/components/app-nav.tsx`** — sidebar de escritorio con **icono + label**
   (ancho `w-56`, activo = acento sólido), en lugar del riel solo-iconos.

Color y logo: cada cliente los configura en **Configuración → Marca** (DB).

## Actualizar desde upstream

```bash
git remote add upstream https://github.com/kevinrivm/vocero-crm.git  # una vez
git fetch upstream
git checkout main
git merge upstream/main
# Conflictos esperables: import en layout.tsx, default de letra en temas.ts,
# y cambios en app-nav.tsx (sidebar con labels) si upstream tocó el riel.
```

Después: un push a `main` (o un tag `vX.Y.Z`) → GitHub Actions publica la imagen en
`ghcr.io/gudlime/crm-war-construcciones` → en Coolify, cambiar el tag y redesplegar.
