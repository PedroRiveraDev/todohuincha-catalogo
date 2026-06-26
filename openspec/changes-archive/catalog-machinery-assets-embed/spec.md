# Delta Spec: catalog-machinery-assets-embed

## ADDED Requirements

### Requirement: image base64 embedding

The script SHALL set `assets.main_image.data_base64` to the base64 of the PNG at `assets.main_image.url`.

#### Scenario: image only

- GIVEN an extended item with PNG on disk, no PDF
- WHEN embedded
- THEN `assets.main_image.data_base64` is a non-empty base64 string

#### Scenario: image and PDF

- GIVEN an extended item with PNG and PDF on disk
- WHEN embedded
- THEN both `data_base64` fields are populated

### Requirement: PDF binary embedding

When a PDF exists, the script SHALL attach `machinery_profile.source_pdf` with `storage_key`, `file_name`, `data_base64`, `sha256`, and `byte_size`.

#### Scenario: full embed

- GIVEN an extended item with PNG and PDF on disk
- WHEN embedded
- THEN `sha256` matches raw PDF sha256 and `byte_size` equals file size

#### Scenario: PDF only

- GIVEN an extended item with PDF but no PNG on disk
- WHEN embedded
- THEN `source_pdf` is fully populated and `data_base64` stays `null`

### Requirement: skip empty specification groups

The script SHALL skip items with empty `specification_groups` and SHALL log one stderr warning per skip.

#### Scenario: SKU 852 skipped

- GIVEN an extended item with empty `specification_groups`
- WHEN embedded
- THEN no embedding fields are written and stderr names the SKU

#### Scenario: neither image nor PDF on disk

- GIVEN an extended item with no PNG and no PDF
- WHEN embedded
- THEN no embedding fields are written and no error is raised

### Requirement: duplicate PDF resolution

When multiple PDFs match an SKU, the script SHALL pick the smallest `file_name` under code-unit order.

#### Scenario: SKU 2200I duplicates

- GIVEN SKU 2200I matches two PDFs in `docs/Catalogo actual\`
- WHEN resolved
- THEN the smallest `file_name` by code-unit order is chosen

#### Scenario: single matching PDF

- GIVEN an item with exactly one matching PDF
- WHEN resolved
- THEN that PDF is chosen

### Requirement: idempotent re-run

Running the script twice SHALL produce byte-identical output, verifiable by sha256 before/after.

#### Scenario: second run no-op

- GIVEN the JSON was embedded once
- WHEN run again
- THEN output sha256 equals input sha256

#### Scenario: stable across duplicates

- GIVEN SKU 2200I has duplicate PDFs
- WHEN run twice
- THEN both runs pick the same `file_name` and sha256

### Requirement: helper resolveImageSrc

`resolveImageSrc(item)` SHALL return the data URI, else `url`, else `""`. Never `null`/`undefined`.

#### Scenario: data URI preferred

- GIVEN an item with non-empty `data_base64`
- WHEN `resolveImageSrc(item)` runs
- THEN result starts with `data:image/png;base64,`

#### Scenario: URL fallback

- GIVEN no `data_base64` but a non-empty `url`
- WHEN `resolveImageSrc(item)` runs
- THEN the result equals `url`

#### Scenario: empty fallback

- GIVEN neither field is set
- WHEN `resolveImageSrc(item)` runs
- THEN the result is `""`

### Requirement: schema validity

After the script runs, the JSON SHALL validate against the updated schema with zero errors.

#### Scenario: updated JSON validates

- GIVEN the JSON after `npm run embed-assets`
- WHEN AJV validates at build time
- THEN zero validation errors are reported

#### Scenario: pre-embed JSON still validates

- GIVEN the JSON before any embedding
- WHEN AJV validates
- THEN zero errors are reported

### Requirement: build artifact size

After the embed and `astro build`, the dist catalog JSON SHALL be 17 MB to 21 MB. The build SHALL NOT fail in range; out of range it logs.

#### Scenario: size in range

- GIVEN the full embed followed by `astro build`
- WHEN measured
- THEN size is 17 MB to 21 MB and build exits 0

#### Scenario: out of range non-fatal

- GIVEN an embed whose size is out of range
- WHEN `astro build` runs
- THEN size is logged and build exits 0

## MODIFIED Requirements

None.

## REMOVED Requirements

None.

## RENAMED Requirements

None.

## Out of Scope

Basic/standard items; compression or re-encoding; frontend consumer; PDF download UI; PNG resize.