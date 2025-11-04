# Configuración de Formularios INCARGO

Los formularios de cotización y contacto ahora están configurados para enviar correos electrónicos usando **Formspree**, un servicio gratuito que no requiere backend.

## 🚀 Pasos para Activar los Formularios

### 1. Crear Cuenta en Formspree (GRATIS)

1. Ve a: https://formspree.io
2. Haz clic en "Get Started" o "Sign Up"
3. Crea una cuenta con tu correo (puedes usar operaciones@incargo.co)
4. Verifica tu correo electrónico

### 2. Crear un Formulario

1. Una vez dentro de Formspree, haz clic en "New Form"
2. Dale un nombre: "INCARGO - Cotizaciones y Contacto"
3. Formspree te dará un código único como: `https://formspree.io/f/xanyarre`

### 3. Actualizar el Código

**IMPORTANTE:** Debes reemplazar el código temporal en los siguientes archivos:

#### Archivos a actualizar:
- `index.html` (línea ~517)
- `quote.html` (línea ~110) 
- `contact.html` (línea ~102)

**Buscar esta línea en cada archivo:**
```html
<form action="https://formspree.io/f/xanyarre" method="POST" id="quoteForm">
```

**Reemplazar con tu código real de Formspree:**
```html
<form action="https://formspree.io/f/TU_CODIGO_AQUI" method="POST" id="quoteForm">
```

### 4. Configurar el Email de Destino

1. En el dashboard de Formspree, selecciona tu formulario
2. Ve a "Settings" > "Email Notifications"
3. Configura que los correos se envíen a: **operaciones@incargo.co**
4. Guarda los cambios

## ✅ Características Implementadas

### Formularios Activos:
1. **Formulario de Cotización** (`index.html` y `quote.html`)
   - Nombre del cliente
   - Email
   - Teléfono
   - Servicio solicitado
   - Mensaje/Notas especiales

2. **Formulario de Contacto** (`contact.html`)
   - Nombre
   - Email
   - Asunto
   - Mensaje

### Funcionalidades:
- ✅ Validación de campos requeridos
- ✅ Mensaje de "Enviando..." mientras se procesa
- ✅ Mensaje de éxito cuando se envía correctamente
- ✅ Mensaje de error si hay problemas
- ✅ Reseteo automático del formulario después de enviar
- ✅ Mensajes desaparecen automáticamente después de 5 segundos

## 📧 ¿Cómo Llegan los Correos?

Cuando un cliente llena el formulario:

1. La información se envía a Formspree
2. Formspree procesa los datos
3. Se envía un correo electrónico a **operaciones@incargo.co** con:
   - Nombre del cliente
   - Email de contacto
   - Teléfono
   - Servicio solicitado (en caso de cotización)
   - Mensaje/Notas

## 🎯 Plan Gratuito de Formspree

- ✅ 50 envíos por mes GRATIS
- ✅ Sin publicidad
- ✅ Sin backend necesario
- ✅ Confirmación de recepción automática
- ✅ Protección anti-spam incluida

Si necesitas más de 50 envíos al mes, puedes actualizar al plan Gold por $10/mes (1000 envíos).

## 🔒 Seguridad

- ✅ Protección CSRF automática
- ✅ Validación de correos electrónicos
- ✅ Protección contra spam con reCAPTCHA (opcional)
- ✅ Sin exposición de credenciales en el código

## 🛠️ Alternativas (Si necesitas más control)

Si más adelante necesitas una solución más robusta:

1. **EmailJS** - Similar a Formspree, hasta 200 emails/mes gratis
2. **SendGrid** - 100 emails/día gratis
3. **Backend Propio** - Node.js + Nodemailer (requiere hosting)
4. **Google Apps Script** - Completamente gratis pero más técnico

## 📱 Notificaciones en WhatsApp (Opcional)

Los formularios también pueden integrarse con WhatsApp Business API si lo deseas en el futuro.

## ⚙️ Testing

Para probar que funciona:

1. Abre el sitio web
2. Llena un formulario de prueba
3. Revisa la bandeja de entrada de **operaciones@incargo.co**
4. El primer envío requerirá que confirmes tu email en Formspree

---

**Última actualización:** Noviembre 4, 2025  
**Contacto técnico:** Para soporte, visita https://help.formspree.io
