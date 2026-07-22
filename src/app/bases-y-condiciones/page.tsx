import type { Metadata } from 'next';
import Link from 'next/link';
import {
  COMPANY,
  CONTACT_EMAIL,
  CONTACT_MAILTO,
  PRODUCT_NAME,
} from '@/lib/site-contact';

export const metadata: Metadata = {
  title: `Bases y Condiciones — ${PRODUCT_NAME}`,
  description: `Bases y Condiciones de uso de ${PRODUCT_NAME}, plataforma de venta y validación de entradas digitales operada por ${COMPANY.legalName}.`,
};

function CompanyBlock({ label = 'Correo electrónico' }: { label?: string }) {
  return (
    <address className="not-italic mt-4 rounded-xl border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
      <strong className="text-foreground">{COMPANY.legalName}</strong>
      <br />
      CUIT {COMPANY.cuit}
      <br />
      {COMPANY.addressLine}
      <br />
      {COMPANY.city}, {COMPANY.province}, {COMPANY.country}
      <br />
      {label}:{' '}
      <a href={CONTACT_MAILTO} className="text-primary hover:underline">
        {CONTACT_EMAIL}
      </a>
      <br />
      Teléfono:{' '}
      <a href={COMPANY.phoneHref} className="text-primary hover:underline">
        {COMPANY.phone}
      </a>
    </address>
  );
}

export default function BasesYCondicionesPage() {
  return (
    <article className="mx-auto max-w-3xl pb-8">
      <Link
        href="/"
        className="text-sm text-muted-foreground transition hover:text-primary"
      >
        ← Volver al inicio
      </Link>

      <header className="mt-6 mb-10">
        <h1 className="font-headline text-3xl font-bold tracking-wide sm:text-4xl">
          Bases y Condiciones — {PRODUCT_NAME}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          <strong>Última actualización:</strong> julio de 2026
        </p>
      </header>

      <div className="space-y-10 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
          <p>
            Las presentes Bases y Condiciones regulan el acceso y uso de{' '}
            <strong className="text-foreground">{PRODUCT_NAME}</strong>, plataforma de software
            como servicio (SaaS) para la creación de eventos, venta y emisión de entradas
            digitales, cobro mediante procesadores de pago y validación de acceso. Al
            registrarse, solicitar una cuenta de productor, acceder o utilizar {PRODUCT_NAME},
            el usuario acepta íntegramente estos términos.
          </p>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              1. Responsable del servicio
            </h2>
            <p>
              El servicio {PRODUCT_NAME} es ofrecido y operado por:
            </p>
            <CompanyBlock />
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              2. Descripción del servicio
            </h2>
            <p>
              {PRODUCT_NAME} permite a productores de eventos (y a su personal autorizado)
              gestionar eventos, emitir entradas digitales, generar enlaces de pago o cortesía,
              registrar ventas en efectivo, administrar vendedores, validar accesos mediante
              código QR y, cuando corresponda, operar módulos complementarios (por ejemplo,
              barra o control de visitantes), según las funcionalidades habilitadas en cada
              cuenta.
            </p>
            <p>
              Los compradores pueden adquirir entradas a través de enlaces de pago, recibir
              confirmaciones por correo electrónico y consultar sus entradas digitales
              cuando exista una cuenta de comprador habilitada.
            </p>
            <p>
              {PRODUCT_NAME} es una herramienta tecnológica. No actúa como organizador del
              evento, no garantiza la realización del espectáculo ni sustituye las
              obligaciones legales del productor frente a los asistentes (incluyendo, en lo
              aplicable, la normativa de defensa del consumidor, espectáculos públicos y
              facturación).
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              3. Usuarios y roles
            </h2>
            <p>Pueden interactuar con la plataforma, entre otros:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground/90">Productores:</strong> cuentas para crear y
                administrar eventos, configurar cobros y gestionar su equipo.
              </li>
              <li>
                <strong className="text-foreground/90">Equipo del productor:</strong> vendedores,
                personal de puerta u otros roles que el productor o el administrador de la
                plataforma habiliten.
              </li>
              <li>
                <strong className="text-foreground/90">Compradores:</strong> personas que adquieren
                o reciben entradas digitales.
              </li>
              <li>
                <strong className="text-foreground/90">Administración de plataforma:</strong>{' '}
                personal de {COMPANY.legalName} con facultades de moderación, aprobación de
                cuentas y configuración de fees.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              4. Registro de productor y aprobación
            </h2>
            <p>
              La solicitud de alta como productor se realiza mediante el formulario de
              registro, con datos veraces y actualizados. El envío de la solicitud no implica
              la habilitación automática de la cuenta.
            </p>
            <p>
              {COMPANY.legalName} se reserva el derecho de aprobar, rechazar o solicitar
              información adicional antes de habilitar el acceso. Mientras la cuenta
              permanezca pendiente o rechazada, el productor no podrá utilizar el panel
              operativo. La aprobación podrá comunicarse por correo electrónico (incluido un
              mensaje de bienvenida) a la dirección declarada en el registro.
            </p>
            <p>
              El usuario es responsable de la confidencialidad de sus credenciales y de toda
              actividad realizada desde su cuenta o desde las cuentas de su equipo.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              5. Fees de plataforma, cupos y facturación
            </h2>
            <p>
              El uso de {PRODUCT_NAME} por parte de productores puede estar sujeto a fees de
              plataforma en monto fijo (por ejemplo, por evento y/o por entrada emitida), cupos
              de eventos y otras condiciones comerciales definidas por la administración de la
              plataforma. {PRODUCT_NAME} no cobra un porcentaje sobre el precio de la entrada:
              el productor define el valor y lo percibe íntegramente a través de su medio de
              cobro (por ejemplo, Mercado Pago), sin perjuicio del fee fijo de emisión
              acordado. Los valores de referencia pueden publicarse en el sitio; los
              aplicables a cada productor se confirman al aprobar la cuenta o mediante
              comunicación posterior, y pueden actualizarse conforme a estas bases.
            </p>
            <p>
              Salvo disposición legal en contrario o acuerdo escrito distinto, los importes
              abonados por períodos o servicios ya iniciados no son reembolsables.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              6. Pagos de entradas y Mercado Pago
            </h2>
            <p>
              El cobro del precio de las entradas al público se realiza, cuando está
              habilitado, a través de la cuenta de Mercado Pago (u otro procesador que se
              indique) vinculada por el productor. El productor es responsable de configurar
              correctamente su medio de cobro, de la relación comercial con el comprador y
              de cumplir sus obligaciones fiscales y de facturación.
            </p>
            <p>
              {COMPANY.legalName} no es parte del contrato de compraventa de la entrada entre
              productor y comprador, salvo que se indique expresamente lo contrario para un
              evento puntual. Las demoras, rechazos, chargebacks o disputas de pago se rigen
              por las condiciones del procesador de pagos y por la relación entre productor y
              comprador.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              7. Entradas digitales y validación
            </h2>
            <p>
              Las entradas emitidas por {PRODUCT_NAME} son instrumentos digitales asociados a
              un evento y a un código de validación (por ejemplo, QR). El productor define
              precio, cupo, vigencia operativa y reglas de acceso del evento. La validación
              en puerta depende del uso correcto de las herramientas de escaneo y de la
              conectividad disponible en el lugar.
            </p>
            <p>
              Queda prohibido falsificar, duplicar indebidamente, revender de forma no
              autorizada por el productor o manipular entradas o códigos de acceso. El
              productor es responsable de la política de reintegros, cambios y cancelación
              del evento frente a los compradores.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              8. Uso aceptable
            </h2>
            <p>El usuario se compromete a utilizar {PRODUCT_NAME} conforme a la ley y a estas bases. Queda prohibido, entre otros:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Usar el servicio con fines ilícitos, fraudulentos o engañosos.</li>
              <li>Suplantar identidades o publicar datos falsos de eventos o organizadores.</li>
              <li>Intentar vulnerar la seguridad, eludir controles técnicos o acceder a datos de terceros sin autorización.</li>
              <li>Revender, sublicenciar o comercializar el acceso a la plataforma sin autorización de {COMPANY.legalName}.</li>
              <li>Compartir credenciales con personas no autorizadas.</li>
              <li>Realizar ingeniería inversa o interferir con el funcionamiento del software, salvo lo permitido por ley.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              9. Propiedad intelectual
            </h2>
            <p>
              La marca {PRODUCT_NAME}, el software, el diseño del sitio y los materiales
              asociados son propiedad de {COMPANY.legalName} o de sus licenciantes. No se
              concede ningún derecho sobre ellos más allá del uso permitido por estas bases.
              Los contenidos del evento (nombre, imágenes, textos comerciales) son
              responsabilidad del productor, quien declara contar con los derechos necesarios
              para su publicación.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              10. Datos personales
            </h2>
            <p>
              El tratamiento de datos personales se realiza conforme a la Ley 25.326 de
              Protección de Datos Personales y normas complementarias. {COMPANY.legalName}
              podrá tratar, entre otros, datos de identificación y contacto necesarios para
              el registro, la operación de la cuenta, la emisión de entradas, la comunicación
              transaccional y el soporte.
            </p>
            <p>
              El titular de los datos podrá ejercer los derechos de acceso, rectificación y
              supresión escribiendo a{' '}
              <a href={CONTACT_MAILTO} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              , en los términos de la normativa vigente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              11. Limitación de responsabilidad
            </h2>
            <p>
              En la máxima medida permitida por la ley aplicable, {COMPANY.legalName} no será
              responsable por daños indirectos, lucro cesante, pérdida de chance o pérdida de
              datos derivados del uso o imposibilidad de uso del servicio; por fallas de
              redes, proveedores de correo, procesadores de pago o fuerza mayor; ni por la
              cancelación, modificación o desarrollo del evento organizado por el productor.
            </p>
            <p>
              Sin perjuicio de derechos irrenunciables del consumidor cuando corresponda, la
              responsabilidad agregada de {COMPANY.legalName} frente al usuario por reclamos
              vinculados al servicio se limitará, en la medida permitida por ley, a los
              importes efectivamente abonados a {COMPANY.legalName} por fees de plataforma en
              los tres (3) meses anteriores al hecho generador.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              12. Suspensión y terminación
            </h2>
            <p>
              {COMPANY.legalName} podrá suspender o dar de baja cuentas que incumplan estas
              bases, la ley o que representen un riesgo para el servicio o para terceros, con
              o sin preaviso según la gravedad del caso. El usuario puede solicitar la baja
              de su cuenta contactando al correo indicado en la sección de contacto.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              13. Modificaciones
            </h2>
            <p>
              {COMPANY.legalName} podrá modificar estas Bases y Condiciones. Las versiones
              actualizadas se publicarán en esta página y entrarán en vigencia desde su
              publicación, sin perjuicio de avisos adicionales que pudieran enviarse por
              correo cuando resulte razonable. El uso continuado del servicio tras los
              cambios implica aceptación de las nuevas condiciones.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              14. Defensa del consumidor
            </h2>
            <p>
              Cuando el usuario revista la calidad de consumidor en los términos de la Ley
              24.240, resultan aplicables los derechos allí reconocidos. Para reclamos
              vinculados al servicio de plataforma, puede escribir a{' '}
              <a href={CONTACT_MAILTO} className="text-primary hover:underline">
                {CONTACT_EMAIL}
              </a>
              . Asimismo, podrá recurrir a los canales oficiales de defensa del consumidor
              previstos por la normativa vigente.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              15. Ley aplicable y jurisdicción
            </h2>
            <p>
              Estas bases se rigen por las leyes de la República Argentina. Ante cualquier
              controversia, las partes se someten a los tribunales ordinarios de la ciudad
              de {COMPANY.city}, {COMPANY.province}, con renuncia a cualquier otro fuero que
              pudiera corresponderles, sin perjuicio de los fueros protectores aplicables a
              consumidores.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-headline text-xl tracking-wide text-foreground">
              16. Contacto
            </h2>
            <p>
              Para consultas sobre estas Bases y Condiciones, el servicio {PRODUCT_NAME} o
              su cuenta:
            </p>
            <CompanyBlock label="Correo electrónico" />
          </section>
        </div>
    </article>
  );
}
