# Fotos de la estructura de la base

Cada archivo es una foto de la estructura de Supabase (tablas, columnas, RLS, políticas,
funciones, triggers y tareas de pg_cron), **sin datos**. Es solo referencia: **no se ejecuta**.

Cómo sacar una nueva: en la app, Configuración > Base de datos > **Descargar estructura (.sql)**,
y guardarla aquí con su fecha (`esquema_supabase_AAAA-MM-DD.sql`). Comparar dos fotos muestra
qué cambió en la base entre una fecha y otra.
