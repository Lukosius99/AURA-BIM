/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import * as THREE from "three";
import {
  IfcAPI,
  ms,
  PlacedGeometry,
  Color,
  FlatMesh,
  IFCSITE,
} from "../../dist/web-ifc-api";
// We are not using BufferGeometryUtils anymore, but you can keep this import if you want to experiment
// import * as BufferGeometryUtils from "three/addons/utils/BufferGeometryUtils.js";

export class IfcThree {
  private ifcAPI: IfcAPI;

  /** Creates an instance of IfcThree, requires a valid instance of IfcAPI */
  constructor(ifcAPI: IfcAPI) {
    this.ifcAPI = ifcAPI;
  }

  /**
   * Loads all geometry for the model with id "modelID" into the supplied scene
   * @scene Threejs Scene object
   * @modelID Model handle retrieved by OpenModel, model must not be closed
   */
  public LoadAllGeometry(scene: THREE.Scene, modelID: number) {
    const startUploadingTime = ms();

    // 🚨 IMPORTANT CHANGE:
    // Instead of merging everything into a single mesh, we create one mesh per IFC element
    // and store expressID + modelID in mesh.userData. This allows picking + properties.
    this.ifcAPI.StreamAllMeshes(modelID, (flatMesh: FlatMesh) => {
      const placedGeometries = flatMesh.geometries;

      for (let i = 0; i < placedGeometries.size(); i++) {
        const placedGeometry = placedGeometries.get(i);

        const threeMesh = this.getPlacedGeometry(modelID, placedGeometry);

        // Attach IFC identifiers for picking
        (threeMesh as any).userData = (threeMesh as any).userData || {};
        (threeMesh as any).userData.expressID = flatMesh.expressID;
        (threeMesh as any).userData.modelID = modelID;

        scene.add(threeMesh);
      }
    });

    console.log(
      `Uploading (unmerged element meshes) took ${ms() - startUploadingTime} ms`
    );
  }

  private getFlatMeshes(modelID: number) {
    const startGeomTime = ms();
    const flatMeshes = this.ifcAPI.LoadAllGeometry(modelID);
    const endGeomTime = ms();
    console.log(`Loaded ${flatMeshes.size()} flatMeshes`);
    console.log(`Loading geometry took ${endGeomTime - startGeomTime} ms`);
    return flatMeshes;
  }

  private getPlacedGeometry(
    modelID: number,
    placedGeometry: PlacedGeometry
  ): THREE.Mesh {
    const geometry = this.getBufferGeometry(modelID, placedGeometry);
    const material = this.getMeshMaterial(placedGeometry.color);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.matrix = this.getMeshMatrix(placedGeometry.flatTransformation);
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  private getBufferGeometry(
    modelID: number,
    placedGeometry: PlacedGeometry
  ): THREE.BufferGeometry {
    // WARNING: geometry must be deleted when requested from WASM
    const geometry = this.ifcAPI.GetGeometry(
      modelID,
      placedGeometry.geometryExpressID
    );
    const verts = this.ifcAPI.GetVertexArray(
      geometry.GetVertexData(),
      geometry.GetVertexDataSize()
    );
    const indices = this.ifcAPI.GetIndexArray(
      geometry.GetIndexData(),
      geometry.GetIndexDataSize()
    );

    const bufferGeometry = this.ifcGeometryToBuffer(
      placedGeometry.color,
      verts,
      indices
    );

    // @ts-ignore
    geometry.delete();
    return bufferGeometry;
  }

  private materials: { [id: string]: THREE.Material } = {};

  private getMeshMaterial(color: Color): THREE.Material {
    const colID = `${color.x}${color.y}${color.z}${color.w}`;
    if (this.materials[colID]) {
      return this.materials[colID];
    }

    const col = new THREE.Color(color.x, color.y, color.z);
    const material = new THREE.MeshPhongMaterial({
      color: col,
      side: THREE.DoubleSide,
    });

    material.transparent = color.w !== 1;
    if (material.transparent) material.opacity = color.w;

    this.materials[colID] = material;
    return material;
  }

  private getMeshMatrix(matrix: Array<number>): THREE.Matrix4 {
    const mat = new THREE.Matrix4();
    mat.fromArray(matrix);
    return mat;
  }

  private ifcGeometryToBuffer(
    color: Color,
    vertexData: Float32Array,
    indexData: Uint32Array
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    // vertexData layout: [posX, posY, posZ, normX, normY, normZ, ...]
    const posFloats = new Float32Array(vertexData.length / 2);
    const normFloats = new Float32Array(vertexData.length / 2);
    const colorFloats = new Float32Array(vertexData.length / 2);

    for (let i = 0; i < vertexData.length; i += 6) {
      posFloats[i / 2 + 0] = vertexData[i + 0];
      posFloats[i / 2 + 1] = vertexData[i + 1];
      posFloats[i / 2 + 2] = vertexData[i + 2];

      normFloats[i / 2 + 0] = vertexData[i + 3];
      normFloats[i / 2 + 1] = vertexData[i + 4];
      normFloats[i / 2 + 2] = vertexData[i + 5];

      colorFloats[i / 2 + 0] = color.x;
      colorFloats[i / 2 + 1] = color.y;
      colorFloats[i / 2 + 2] = color.z;
    }

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(posFloats, 3)
    );
    geometry.setAttribute("normal", new THREE.BufferAttribute(normFloats, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colorFloats, 3));
    geometry.setIndex(new THREE.BufferAttribute(indexData, 1));

    return geometry;
  }
}
