{
    "name": "Life Deportes — Auditoría impresión vs lista",
    "summary": "Compara adjuntos Excel (FORMATO PEDIDO LIFE) con PDF de impresión en tareas de proyecto; informe en chatter.",
    "description": """
Al crear un PDF adjunto a una ``project.task`` (y en etapa Fabricación por
defecto), compara la lista leída del Excel o JSON con el texto extraído del
PDF y publica el resultado en el chatter. Incluye acción de servidor manual
\"Auditar lista vs PDF\".
""",
    "version": "1.0.0",
    "license": "LGPL-3",
    "author": "Life Deportes",
    "category": "Project",
    "depends": ["project", "sale_project", "mail"],
    "data": [
        "data/ir_config_parameter.xml",
        "data/ir_config_parameter_qc_flow.xml",
        "data/ir_actions_server.xml",
        "views/project_task_views.xml",
    ],
    "external_dependencies": {"python": ["openpyxl", "pdfplumber"]},
    "installable": True,
    "application": False,
}
