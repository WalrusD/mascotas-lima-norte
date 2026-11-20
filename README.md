# Barrio Limpio · Lima Norte

Aplicación web para registro de mascotas, reportes de puntos críticos y atención municipal. React + Vite, Supabase Auth/PostgreSQL/Storage, mapa Leaflet y despliegue Vercel.

## Preparación

1. Crear proyecto en Supabase y ejecutar `supabase/schema.sql` en SQL Editor.
2. En Supabase Auth configurar URL del sitio y URL de redirección con el dominio de Vercel. Habilitar ingreso por enlace enviado al correo.
3. En Vercel añadir `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` para Production; en local copiarlas a `.env.local` desde `.env.example`.
4. Ejecutar `npm ci`, `npm test`, `npm run lint`, `npm run build`, `npm run dev`.
5. El usuario municipal debe recibir `app_metadata.role = inspector` desde Supabase Auth Admin, nunca desde el formulario público. Tras cambiarlo, volver a iniciar sesión.

El mapa muestra solo reportes con coordenadas; el texto y la identidad del denunciante no se exponen públicamente. Las fotografías se guardan en bucket privado. Los distritos cubiertos son Los Olivos, Comas, San Martín de Porres e Independencia.

## Entrega CI/CD

Abrir PR de `test` hacia `main`. Actions ejecuta setup → install → test → security → deploy. Configurar `VERCEL_TOKEN` como secreto del entorno GitHub `production` y `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` como variables. Mantener el entorno production restringido a `main`. Desactivar el despliegue automático de Git en Vercel si se utiliza este job para evitar duplicados.
