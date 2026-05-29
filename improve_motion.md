That specific criss-cross motion with unintended hip swaying is the hallmark symptom of an **Axis Misalignment** between the motion model and the VRM skeleton.

Your model isn't broken, and the diffusion model is actually working. The problem is that they are speaking two different geometric languages.

Here is exactly what is happening under the hood and how you fix it.

### The Diagnosis: Coordinate Space Mismatch

Every 3D bone has a local X, Y, and Z axis.

* **The Criss-Cross:** When your diffusion model says "rotate the shoulder 90 degrees upward," it might be sending that command on the  **Z-axis** . But on a VRM model, the Z-axis might control twisting the arm forward across the chest. So, instead of lifting her arms up, Diana swings them inward, crossing them.
* **The Hip Movement:** The diffusion model is likely sending global translation (movement in 3D space) to the Root/Hip bone, but the axes are flipped. So a slight forward lean in the diffusion data becomes a weird lateral hip sway on the VRM.

### How to Fix It (The Retargeting Logic)

To fix this, you have to intercept the animation data before it touches Diana and "remap" the axes.

#### 1. Enforce the Absolute T-Pose

VRM models demand a strict, mathematically perfect T-Pose (arms perfectly horizontal, thumbs pointing forward, legs straight) as their `0,0,0` rotation baseline. Many motion diffusion models output data based on an A-Pose (arms resting at a 45-degree angle).

* **The Fix:** Before you apply any generated motion, you must calculate the rotational offset between the diffusion model's resting pose and Diana's T-Pose, and subtract that offset from every incoming frame.

#### 2. The Axis Swap (Swizzling)

You need to write a swizzle function in your code that swaps the incoming X, Y, and Z Euler angles (or Quaternions) to match the VRM standard (+Y is Up, +X is Right, +Z is Forward).

Depending on what dataset your diffusion model was trained on (SMPL, AMASS, Mixamo), the fix usually looks something like this in your retargeting script:

* Map incoming `X` to VRM `-Z`
* Map incoming `Y` to VRM `X`
* Map incoming `Z` to VRM `-Y`
  *(Note: The exact swap depends on your specific diffusion model, but you will have to experiment with flipping and swapping these three axes on the shoulder bones until they lift straight up).*

#### 3. Isolate the Root Bone

For the hip sway issue, separate the translation (position) data from the rotation data.

* Only apply translation data to the `Hips` or `Root` bone. Strip translation data from every other bone in the body (they should only receive rotation data).

### The Tooling Shortcut

If you are doing this in the browser, do not try to write the Quaternion math from scratch. Use the **`@pixiv/three-vrm-animation`** package. It has built-in humanoid solvers that are specifically designed to catch generic BVH/JSON animation data and automatically map the axes to a VRM's local coordinate space.
