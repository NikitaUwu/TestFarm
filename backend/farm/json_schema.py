"""Convert Pydantic schemas to strict structured-output object requirements."""
from copy import deepcopy


def strict_compatible(schema):
    if isinstance(schema,dict):
        if isinstance(schema.get('additionalProperties'),dict): return False
        return all(strict_compatible(v) for v in schema.values())
    if isinstance(schema,list): return all(strict_compatible(v) for v in schema)
    return True


def strict_schema(schema):
    result=deepcopy(schema)
    def visit(node):
        if isinstance(node,dict):
            node.pop('default',None)
            if node.get('type')=='object' and 'properties' in node:
                node['additionalProperties']=False
                node['required']=list(node['properties'])
            for value in node.values(): visit(value)
        elif isinstance(node,list):
            for value in node: visit(value)
    visit(result)
    return result
