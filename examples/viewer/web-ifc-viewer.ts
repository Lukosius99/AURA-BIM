// @ts-nocheck

import {
  IfcAPI,
  LogLevel,
  ms,
  Schemas,
  IFCUNITASSIGNMENT,
  IFCAXIS2PLACEMENT3D,
  IFCLENGTHMEASURE,
  IFCCARTESIANPOINT,
  IFCAXIS2PLACEMENT2D,
  IFCCIRCLEPROFILEDEF,
  IFCDIRECTION,
  IFCREAL,
  IFCPOSITIVELENGTHMEASURE,
  IFCCOLUMN,
  IFCEXTRUDEDAREASOLID,
  IFCGLOBALLYUNIQUEID,
  IFCLABEL,
  IFCIDENTIFIER,
} from "../../dist/web-ifc-api";
import { IfcThree } from "./web-ifc-three";
import {
  Init3DView,
  InitBasicScene,
  ClearScene,
  scene,
  camera,
  controls,
} from "./web-ifc-scene";
import * as Monaco from "monaco-editor";
import * as ts_decl from "./ts_src";
import * as ts from "typescript";
import { exampleCode } from "./example";
import * as THREE from "three";

let ifcAPI = new IfcAPI();
ifcAPI.SetWasmPath("./");
let ifcThree = new IfcThree(ifcAPI);

let timeout: any = undefined;

// For picking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let currentModelID: number | null = null;

// For highlighting
const highlightedObjects: THREE.Object3D[] = [];
const highlightMaterial = new THREE.MeshPhongMaterial({
  color: 0xffc107, // amber-ish highlight
});

function Edited(monacoEditor: Monaco.editor.IStandaloneCodeEditor) {
  let code = monacoEditor.getValue();
  window.localStorage.setItem("code", code);
  console.log("Saved code...");
}

if (typeof window != "undefined") {
  // @ts-ignore
  window.InitMonaco = (monaco: any) => {
    console.log(ts_decl.ifc_schema);
    // validation settings
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    // compiler options
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES6,
      allowNonTsExtensions: true,
    });

    console.log(
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        ts_decl.ifc_schema
      )
    );
    console.log(
      monaco.languages.typescript.typescriptDefaults.addExtraLib(
        ts_decl.wifcapi
      )
    );
  };
}

function initMonacoEditor(monacoEditor: Monaco.editor.IStandaloneCodeEditor) {
  let item = window.localStorage.getItem("code");
  if (item) {
    monacoEditor.setValue(item);
  } else {
    monacoEditor.setValue(exampleCode);
  }

  monacoEditor.onDidChangeModelContent((e) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => Edited(monacoEditor), 1000);
  });

  setTimeout(() => {
    Edited(monacoEditor);
  }, 1000);
}

if (typeof window != "undefined") {
  // @ts-ignore
  window.InitWebIfcViewer = async (
    monacoEditor: Monaco.editor.IStandaloneCodeEditor
  ) => {
    await ifcAPI.Init();
    initMonacoEditor(monacoEditor);

    const fileInput = document.getElementById("finput");
    fileInput?.addEventListener("change", fileInputChanged);

    const codereset = document.getElementById("rcode");
    codereset?.addEventListener("click", resetCode);

    const coderun = document.getElementById("runcode");
    coderun?.addEventListener("click", runCode);

    const clearmem = document.getElementById("cmem");
    clearmem?.addEventListener("click", clearMem);

    const changeLogLevelSelect = document.getElementById("logLevel");
    changeLogLevelSelect?.addEventListener("change", changeLogLevel);

    // --- 3D view setup ---
    Init3DView();
    InitBasicScene(); // lights etc.

    // 🔹 AURA BIM customizations: dark background + grid
    try {
      scene.background = new THREE.Color(0x111827);

      const gridSize = 1000;
      const gridDivisions = 100;

      const grid = new THREE.GridHelper(
        gridSize,
        gridDivisions,
        new THREE.Color(0x4b5563),
        new THREE.Color(0x1f2937)
      );

      grid.position.y = 0;
      scene.add(grid);
    } catch (e) {
      console.warn("Failed to add grid/background:", e);
    }

    // Enable picking
    setupPicking();
  };
}

async function changeLogLevel() {
  let fileInput = document.getElementById("logLevel") as HTMLInputElement;
  ifcAPI.SetLogLevel(fileInput.value);
  console.log("Log Level Set to:" + fileInput.value);
}

async function runCode() {
  let model = ifcAPI.CreateModel({ schema: Schemas.IFC4 });

  scene.clear();
  InitBasicScene();

  let code = window.localStorage.getItem("code") || "";
  let compiled = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });

  {
    console.log(` --- Starting EVAL!`);
    eval(
      "(function (ifcAPI,IFCAXIS2PLACEMENT3D,IFCLENGTHMEASURE,IFCCARTESIANPOINT,IFCAXIS2PLACEMENT2D,IFCCIRCLEPROFILEDEF,IFCDIRECTION,IFCREAL,IFCPOSITIVELENGTHMEASURE,IFCCOLUMN,IFCEXTRUDEDAREASOLID,IFCGLOBALLYUNIQUEID,IFCLABEL,IFCIDENTIFIER) {" +
        compiled.outputText +
        "})"
    )(
      ifcAPI,
      IFCAXIS2PLACEMENT3D,
      IFCLENGTHMEASURE,
      IFCCARTESIANPOINT,
      IFCAXIS2PLACEMENT2D,
      IFCCIRCLEPROFILEDEF,
      IFCDIRECTION,
      IFCREAL,
      IFCPOSITIVELENGTHMEASURE,
      IFCCOLUMN,
      IFCCARTESIANPOINT,
      IFCEXTRUDEDAREASOLID,
      IFCGLOBALLYUNIQUEID,
      IFCLABEL,
      IFCIDENTIFIER
    );
    console.log(` --- Ending EVAL!`);
  }

  let ifcData = ifcAPI.SaveModel(model);
  let ifcDataString = new TextDecoder("ascii").decode(ifcData);

  ifcAPI.CloseModel(model);

  let m2 = ifcAPI.OpenModel(ifcData);
  currentModelID = m2;
  ifcThree.LoadAllGeometry(scene, m2);

  // Fit camera to generated geometry
  fitSceneToObjects();
}

async function resetCode() {
  window.localStorage.setItem("code", exampleCode);
  location.reload();
}

async function clearMem() {
  ClearScene();
  ifcAPI.Dispose();
  await ifcAPI.Init();
  currentModelID = null;
  clearHighlight();
  updatePropertiesPanel(null);
}

async function fileInputChanged() {
  let fileInput = document.getElementById("finput") as HTMLInputElement;
  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    return console.log("No files selected!");
  }
  const file = fileInput.files[0];
  const reader = getFileReader(fileInput);
  reader.readAsArrayBuffer(file);
}

function getFileReader(fileInput: HTMLInputElement) {
  var reader = new FileReader();
  reader.onload = () => {
    const data = getData(reader);
    LoadModel(data);
    fileInput.value = "";
  };
  return reader;
}

function getData(reader: FileReader) {
  const startRead = ms();
  // @ts-ignore
  const data = new Uint8Array(reader.result as ArrayBuffer);
  const readTime = ms() - startRead;
  console.log(`Reading took ${readTime} ms`);
  return data;
}

async function LoadModel(data: Uint8Array) {
  const start = ms();
  const modelID = ifcAPI.OpenModel(data, {
    // IMPORTANT: keep original coordinates so multiple IFCs line up correctly
    COORDINATE_TO_ORIGIN: false,
    CIRCLE_SEGMENTS: 6,
    TOLERANCE_PLANE_INTERSECTION: 1.0e-4,
    TOLERANCE_PLANE_DEVIATION: 1.0e-4,
    TOLERANCE_BACK_DEVIATION_DISTANCE: 1.0e-4,
    TOLERANCE_INSIDE_OUTSIDE_PERIMETER: 1.0e-10,
    TOLERANCE_SCALAR_EQUALITY: 1.0e-4,
    PLANE_REFIT_ITERATIONS: 3,
    BOOLEAN_UNION_THRESHOLD: 100,
  });

  currentModelID = modelID;

  const time = ms() - start;
  console.log(`Opening model took ${time} ms`);
  ifcThree.LoadAllGeometry(scene, modelID);

  // Auto-zoom camera to include all loaded geometry
  fitSceneToObjects();

  if (
    ifcAPI.GetModelSchema(modelID) == "IFC2X3" ||
    ifcAPI.GetModelSchema(modelID) == "IFC4" ||
    ifcAPI.GetModelSchema(modelID) == "IFC4X3_RC4"
  ) {
    let types = await ifcAPI.GetAllTypesOfModel(modelID);
    if (types) {
      for (let i = 0; i < types.length; i++) {
        let type = types[i];
        // inspect types here if needed
      }
    }
  }

  try {
    let alignments = await ifcAPI.GetAllAlignments(modelID);
    console.log("Alignments: ", alignments);
  } catch (error) {
    console.error("An error occurred:", error);
  }

  let lines = ifcAPI.GetLineIDsWithType(modelID, IFCUNITASSIGNMENT);
  for (let l = 0; l < lines.size(); l++) {
    let unitList = ifcAPI.GetLine(modelID, lines.get(l));
    for (let u = 0; u < unitList.Units.length; u++) {
      // units available here if needed
    }
  }

  // keep model open so picking can query properties
}

/* ------------------------------------------------------------------ */
/* Fit camera to scene                                                */
/* ------------------------------------------------------------------ */

function fitSceneToObjects() {
  if (!scene || !camera) return;

  const bbox = new THREE.Box3();
  const tempBox = new THREE.Box3();
  let hasMesh = false;

  scene.traverse((obj) => {
    const anyObj = obj as any;
    if (anyObj.isMesh) {
      tempBox.setFromObject(anyObj);
      if (!tempBox.isEmpty()) {
        bbox.union(tempBox);
        hasMesh = true;
      }
    }
  });

  if (!hasMesh) return;

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = (camera.fov * Math.PI) / 180;
  let distance = maxDim / (2 * Math.tan(fov / 2));
  distance *= 1.5; // add some padding

  const dir = new THREE.Vector3(1, 1, 1).normalize();
  const newPos = center.clone().add(dir.multiplyScalar(distance));

  camera.position.copy(newPos);
  camera.near = distance / 100;
  camera.far = distance * 100;
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

/* ------------------------------------------------------------------ */
/* Picking + properties panel + highlight                              */
/* ------------------------------------------------------------------ */

function setupPicking() {
  const container = document.getElementById("3dcontainer") as HTMLDivElement;
  if (!container) return;

  container.addEventListener("pointerdown", (event: PointerEvent) => {
    handlePick(event).catch((e) =>
      console.error("Error during picking:", e)
    );
  });
}

async function handlePick(event: PointerEvent) {
  if (currentModelID == null) {
    clearHighlight();
    updatePropertiesPanel(null);
    return;
  }

  const container = document.getElementById("3dcontainer") as HTMLDivElement;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Only intersect objects that are likely IFC meshes (have userData.modelID)
  const allMeshes: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    const anyObj = obj as any;
    if (
      anyObj.isMesh &&
      anyObj.userData &&
      anyObj.userData.modelID != null
    ) {
      allMeshes.push(anyObj);
    }
  });

  const intersects = raycaster.intersectObjects(allMeshes, true);

  if (!intersects.length) {
    clearHighlight();
    updatePropertiesPanel(null);
    return;
  }

  const hit = intersects[0];

  // Walk up the parent chain until we find an object with userData.expressID
  let obj: any = hit.object;
  let expressID: number | null = null;
  let modelID: number | null = null;

  while (obj && obj !== scene) {
    if (obj.userData) {
      const ud = obj.userData;
      if (
        ud.expressID != null ||
        ud.expressId != null ||
        ud.IFC_id != null
      ) {
        expressID = ud.expressID ?? ud.expressId ?? ud.IFC_id;
        modelID = ud.modelID ?? currentModelID;
        break;
      }
    }
    obj = obj.parent;
  }

  if (expressID == null || modelID == null) {
    clearHighlight();
    updatePropertiesPanel(null);
    return;
  }

  // Highlight all meshes for this element
  highlightElement(modelID, expressID);

  try {
    const props = await ifcAPI.GetLine(modelID, expressID);
    updatePropertiesPanel({ expressID, props });
  } catch (e) {
    console.error("Failed to get properties", e);
    updatePropertiesPanel(null);
  }
}

/* ------------------------------------------------------------------ */
/* Highlight helpers                                                   */
/* ------------------------------------------------------------------ */

function clearHighlight() {
  for (const obj of highlightedObjects) {
    const anyObj = obj as any;
    if (anyObj.userData && anyObj.userData.originalMaterial) {
      anyObj.material = anyObj.userData.originalMaterial;
    }
  }
  highlightedObjects.length = 0;
}

function highlightElement(modelID: number, expressID: number) {
  clearHighlight();

  scene.traverse((obj) => {
    const anyObj = obj as any;
    if (
      anyObj.isMesh &&
      anyObj.userData &&
      anyObj.userData.modelID === modelID &&
      (anyObj.userData.expressID === expressID ||
        anyObj.userData.expressId === expressID ||
        anyObj.userData.IFC_id === expressID)
    ) {
      if (!anyObj.userData.originalMaterial) {
        anyObj.userData.originalMaterial = anyObj.material;
      }
      anyObj.material = highlightMaterial;
      highlightedObjects.push(anyObj);
    }
  });
}

/* ------------------------------------------------------------------ */
/* UI helpers for properties panel                                    */
/* ------------------------------------------------------------------ */

type ElementInfo = { expressID: number; props: any } | null;

function updatePropertiesPanel(info: ElementInfo) {
  const panel = document.getElementById(
    "properties-panel"
  ) as HTMLDivElement | null;
  const content = document.getElementById(
    "properties-content"
  ) as HTMLDivElement | null;
  if (!panel || !content) return;

  if (!info) {
    panel.style.display = "none";
    content.innerHTML = "Click an element in the model.";
    return;
  }

  panel.style.display = "block";

  const { expressID, props } = info;
  const rows: string[] = [];

  const pushRow = (key: string, value: string) => {
    rows.push(
      `<tr><td class="key">${escapeHtml(
        key
      )}</td><td class="value">${escapeHtml(value)}</td></tr>`
    );
  };

  pushRow("ExpressID", String(expressID));

  if (props.GlobalId?.value) pushRow("GlobalId", props.GlobalId.value);
  if (props.Name?.value) pushRow("Name", props.Name.value);
  if (props.PredefinedType?.value)
    pushRow("PredefinedType", props.PredefinedType.value);

  for (const key of Object.keys(props)) {
    if (
      key === "expressID" ||
      key === "type" ||
      key === "GlobalId" ||
      key === "Name" ||
      key === "PredefinedType"
    ) {
      continue;
    }
    const v = props[key];
    pushRow(key, formatPropValue(v));
  }

  content.innerHTML = `<table>${rows.join("")}</table>`;
}

function formatPropValue(v: any): string {
  if (v == null) return "";
  if (typeof v === "object" && "value" in v) return String(v.value);
  return JSON.stringify(v);
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  });
}
